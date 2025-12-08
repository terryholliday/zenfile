export interface UserContext {
  id: string | number
  name: string
}

export interface ContactEntry {
  id: string | number
  name: string
  aliases?: string[]
}

export interface EntityExtraction {
  targetObj: string[]
  personRef?: string | null
  timeRef?: string | null
  action?: string | null
}

export interface ResolvedFilters {
  authorId?: string | number
  dateRange?: { start: string; end: string }
  semanticTags: string[]
  fileTypes: string[]
  textEmbeddingPrompt: string
}

export interface QueryConstruction {
  sql: string
  params: Array<string | number>
  filters: ResolvedFilters
}

export type EntityParser = (input: string, now: Date) => EntityExtraction

const DEFAULT_FILE_TYPES = ['pdf', 'jpg', 'jpeg', 'png'] as const

function normalizeUtcStart(date: Date): Date {
  const copy = new Date(date)
  copy.setUTCHours(0, 0, 0, 0)
  return copy
}

function normalizeUtcEnd(date: Date): Date {
  const copy = new Date(date)
  copy.setUTCHours(23, 59, 59, 999)
  return copy
}

function startOfUtcWeek(date: Date): Date {
  const normalized = normalizeUtcStart(date)
  const day = normalized.getUTCDay()
  const diff = (day + 6) % 7 // Convert Sunday (0) to 6 so Monday is start
  normalized.setUTCDate(normalized.getUTCDate() - diff)
  return normalized
}

function endOfUtcWeek(date: Date): Date {
  const start = startOfUtcWeek(date)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  end.setUTCHours(23, 59, 59, 999)
  return end
}

export class ZenQueryEngine {
  private readonly user: UserContext
  private readonly now: Date
  private readonly contacts: ContactEntry[]
  private readonly parser: EntityParser

  constructor(userContext: UserContext, currentTime: Date, options?: { contacts?: ContactEntry[]; parser?: EntityParser }) {
    this.user = userContext
    this.now = new Date(currentTime)
    this.contacts = options?.contacts ?? []
    this.parser = options?.parser ?? this.defaultParser.bind(this)
  }

  processNaturalQuery(inputString: string): QueryConstruction {
    const entities = this.parser(inputString, this.now)

    const filters: ResolvedFilters = {
      semanticTags: this.expandSynonyms(entities.targetObj),
      fileTypes: [...DEFAULT_FILE_TYPES],
      textEmbeddingPrompt: 'financial document'
    }

    if (entities.personRef) {
      filters.authorId = this.resolveContactId(entities.personRef)
    }

    if (entities.timeRef) {
      filters.dateRange = this.calculateDateRange(entities.timeRef)
    }

    return this.buildSql(filters)
  }

  private resolveContactId(nameString: string): string | number {
    const normalized = nameString.trim().toLowerCase()
    const isCurrentUser = normalized === this.user.name.trim().toLowerCase()

    if (isCurrentUser) {
      return this.user.id
    }

    const match = this.contacts.find((contact) => {
      const aliases = contact.aliases ?? []
      const names = [contact.name, ...aliases].map((value) => value.trim().toLowerCase())
      return names.includes(normalized)
    })

    return match?.id ?? normalized
  }

  private calculateDateRange(timePhrase: string): { start: string; end: string } {
    const lowered = timePhrase.trim().toLowerCase()
    const now = new Date(this.now)

    if (lowered.includes('today')) {
      const start = normalizeUtcStart(now)
      const end = normalizeUtcEnd(now)
      return { start: start.toISOString(), end: end.toISOString() }
    }

    if (lowered.includes('yesterday')) {
      const start = normalizeUtcStart(now)
      start.setUTCDate(start.getUTCDate() - 1)
      const end = normalizeUtcEnd(start)
      return { start: start.toISOString(), end: end.toISOString() }
    }

    if (lowered.includes('last week')) {
      const start = startOfUtcWeek(now)
      start.setUTCDate(start.getUTCDate() - 7)
      const end = endOfUtcWeek(start)
      return { start: start.toISOString(), end: end.toISOString() }
    }

    if (lowered.includes('this week')) {
      const start = startOfUtcWeek(now)
      const end = endOfUtcWeek(now)
      return { start: start.toISOString(), end: end.toISOString() }
    }

    if (lowered.includes('last month')) {
      const start = normalizeUtcStart(now)
      start.setUTCMonth(start.getUTCMonth() - 1, 1)
      const end = normalizeUtcEnd(new Date(start))
      end.setUTCMonth(end.getUTCMonth() + 1, 0)
      return { start: start.toISOString(), end: end.toISOString() }
    }

    if (lowered.includes('this month')) {
      const start = normalizeUtcStart(now)
      start.setUTCDate(1)
      const end = normalizeUtcEnd(now)
      return { start: start.toISOString(), end: end.toISOString() }
    }

    const end = normalizeUtcEnd(now)
    const start = normalizeUtcStart(now)
    start.setUTCDate(start.getUTCDate() - 30)
    return { start: start.toISOString(), end: end.toISOString() }
  }

  private expandSynonyms(targetObjects: string[]): string[] {
    const base = ['receipt', 'invoice', 'bill', 'payment', 'purchase', 'proof of payment']
    const normalizedTargets = targetObjects.map((entry) => entry.trim().toLowerCase())
    const collection = new Set<string>([...base, ...normalizedTargets])
    return Array.from(collection)
  }

  private buildSql(filters: ResolvedFilters): QueryConstruction {
    const clauses: string[] = []
    const params: Array<string | number> = []
    let paramIndex = 1

    if (filters.authorId !== undefined) {
      clauses.push(`author_id = $${paramIndex}`)
      params.push(filters.authorId)
      paramIndex += 1
    }

    if (filters.dateRange) {
      clauses.push(`upload_date BETWEEN $${paramIndex} AND $${paramIndex + 1}`)
      params.push(filters.dateRange.start, filters.dateRange.end)
      paramIndex += 2
    }

    const tagPlaceholders = filters.semanticTags.map((_, index) => `$${paramIndex + index}`)
    params.push(...filters.semanticTags)
    paramIndex += filters.semanticTags.length

    const fileTypePlaceholders = filters.fileTypes.map((_, index) => `$${paramIndex + index}`)
    params.push(...filters.fileTypes)
    paramIndex += filters.fileTypes.length

    const embeddingPlaceholder = `$${paramIndex}`
    params.push(filters.textEmbeddingPrompt)
    paramIndex += 1

    clauses.push(`(
  tags && ARRAY[${tagPlaceholders.join(', ')}]
  OR file_type = ANY(ARRAY[${fileTypePlaceholders.join(', ')}])
  OR ai_summary_vector @@ websearch_to_tsquery(${embeddingPlaceholder})
)`)

    const whereClause = clauses.length > 0 ? `WHERE\n  ${clauses.join('\n  AND ')}` : ''

    const sql = `SELECT * FROM files
${whereClause}
ORDER BY upload_date DESC;`

    return {
      sql,
      params,
      filters
    }
  }

  private defaultParser(input: string, _now: Date): EntityExtraction {
    const lower = input.toLowerCase()
    const targets: string[] = []
    if (lower.includes('receipt')) targets.push('receipt')
    if (lower.includes('invoice')) targets.push('invoice')
    if (lower.includes('bill')) targets.push('bill')

    const timeRef = this.extractTimePhrase(lower)
    const personRef = this.extractPersonRef(input)

    return {
      targetObj: targets.length > 0 ? targets : ['receipt'],
      personRef,
      timeRef,
      action: lower.includes('upload') ? 'uploaded' : null
    }
  }

  private extractPersonRef(input: string): string | null {
    const pattern = /\b(?:for|from|by)\s+([A-Z][a-zA-Z]*)/g
    const matches = Array.from(input.matchAll(pattern))
    if (matches.length > 0) {
      return matches[matches.length - 1][1]
    }

    const stopWords = new Set(['show', 'find', 'list', 'display'])
    const sanitizedWords = input
      .split(/\s+/)
      .map((word) => word.replace(/[^A-Za-z]/g, ''))
      .filter((word) => word.length > 0)
    const words = sanitizedWords.filter((word) => /^[A-Z][a-zA-Z]+/.test(word))
    const candidates = words.filter((word) => !stopWords.has(word.toLowerCase()))
    return candidates.length > 0 ? candidates[candidates.length - 1] : null
  }

  private extractTimePhrase(lower: string): string | null {
    const known = ['last week', 'this week', 'today', 'yesterday', 'last month', 'this month']
    for (const phrase of known) {
      if (lower.includes(phrase)) {
        return phrase
      }
    }

    return null
  }
}
