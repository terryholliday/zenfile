export type QueryEntities = {
  target?: string
  person?: string
  time?: string
}

export type DateRange = {
  start: string
  end: string
}

export type QueryFilters = {
  authorId?: string | null
  dateRange?: DateRange | null
  semanticTags?: string[]
}

export type SqlStatement = {
  query: string
  params: Array<string | string[]>
}

export class ZenQueryEngine {
  private readonly contactDirectory: Record<string, string> = {
    terry: 'contact_terry',
    alex: 'contact_alex',
    jordan: 'contact_jordan'
  }

  processNaturalQuery(inputString: string): { filters: QueryFilters; sql: SqlStatement; entities: QueryEntities } {
    const entities = this.aiParse(inputString)

    const filters: QueryFilters = {
      authorId: this.resolveContact(entities.person),
      dateRange: this.resolveTime(entities.time),
      semanticTags: this.expandSynonyms(entities.target)
    }

    const sql = this.buildSql(filters)
    return { filters, sql, entities }
  }

  aiParse(inputString: string): QueryEntities {
    const normalized = inputString.toLowerCase()

    const targetMatch = this.extractTarget(normalized)
    const personMatch = this.extractPerson(inputString)
    const timeMatch = this.extractTime(normalized)

    return {
      target: targetMatch ?? undefined,
      person: personMatch ?? undefined,
      time: timeMatch ?? undefined
    }
  }

  resolveContact(person?: string): string | null {
    if (!person) return null
    const key = person.trim().toLowerCase()
    return this.contactDirectory[key] ?? null
  }

  resolveTime(timePhrase?: string): DateRange | null {
    if (!timePhrase) return null

    const today = new Date()
    const startOfDay = (date: Date) => {
      const copy = new Date(date)
      copy.setHours(0, 0, 0, 0)
      return copy
    }

    const endOfDay = (date: Date) => {
      const copy = new Date(date)
      copy.setHours(23, 59, 59, 999)
      return copy
    }

    const toRange = (start: Date, end: Date): DateRange => ({
      start: start.toISOString(),
      end: end.toISOString()
    })

    switch (timePhrase) {
      case 'today': {
        const start = startOfDay(today)
        const end = endOfDay(today)
        return toRange(start, end)
      }
      case 'yesterday': {
        const start = startOfDay(new Date(today.getTime() - 24 * 60 * 60 * 1000))
        const end = endOfDay(start)
        return toRange(start, end)
      }
      case 'last week': {
        const dayIndex = today.getDay()
        const diffToMonday = dayIndex === 0 ? 6 : dayIndex - 1
        const end = endOfDay(new Date(today.getTime() - (diffToMonday + 1) * 24 * 60 * 60 * 1000))
        const start = startOfDay(new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000))
        return toRange(start, end)
      }
      case 'this week': {
        const dayIndex = today.getDay()
        const diffToMonday = dayIndex === 0 ? 6 : dayIndex - 1
        const start = startOfDay(new Date(today.getTime() - diffToMonday * 24 * 60 * 60 * 1000))
        const end = endOfDay(today)
        return toRange(start, end)
      }
      case 'last month': {
        const start = startOfDay(new Date(today.getFullYear(), today.getMonth() - 1, 1))
        const end = endOfDay(new Date(today.getFullYear(), today.getMonth(), 0))
        return toRange(start, end)
      }
      case 'this month': {
        const start = startOfDay(new Date(today.getFullYear(), today.getMonth(), 1))
        const end = endOfDay(today)
        return toRange(start, end)
      }
      default:
        return null
    }
  }

  expandSynonyms(target?: string): string[] {
    if (!target) return []

    const normalized = target.trim().toLowerCase()
    const synonyms: Record<string, string[]> = {
      receipt: ['receipt', 'invoice', 'bill', 'proof of purchase'],
      invoice: ['invoice', 'bill', 'statement'],
      contract: ['contract', 'agreement', 'deal'],
      report: ['report', 'summary', 'statement']
    }

    return synonyms[normalized] ?? [normalized]
  }

  buildSql(filters: QueryFilters): SqlStatement {
    const whereClauses: string[] = []
    const params: Array<string | string[]> = []

    if (filters.authorId) {
      params.push(filters.authorId)
      whereClauses.push(`author_id = $${params.length}`)
    }

    if (filters.dateRange) {
      params.push(filters.dateRange.start, filters.dateRange.end)
      const startIndex = params.length - 1
      const endIndex = params.length
      whereClauses.push(`created_at BETWEEN $${startIndex} AND $${endIndex}`)
    }

    if (filters.semanticTags && filters.semanticTags.length > 0) {
      params.push(filters.semanticTags)
      whereClauses.push(`LOWER(document_type) = ANY($${params.length})`)
    }

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
    const query = `SELECT * FROM documents ${where};`

    return { query, params }
  }

  private extractTarget(normalizedInput: string): string | null {
    const targets = ['receipt', 'invoice', 'contract', 'report', 'bill']
    for (const target of targets) {
      if (normalizedInput.includes(target)) {
        return target
      }
    }
    return null
  }

  private extractPerson(rawInput: string): string | null {
    const personRegex = /\b(?:from|by|for)\s+([A-Z][a-z]+)/
    const match = rawInput.match(personRegex)
    return match ? match[1] : null
  }

  private extractTime(normalizedInput: string): string | null {
    const timePhrases = ['today', 'yesterday', 'last week', 'this week', 'last month', 'this month']
    return timePhrases.find((phrase) => normalizedInput.includes(phrase)) ?? null
  }
}
