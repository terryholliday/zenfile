import { describe, expect, it } from 'vitest'
import { ZenQueryEngine } from './zenQueryEngine'

describe('ZenQueryEngine', () => {
  const now = new Date('2025-12-08T12:00:00Z')

  const engine = new ZenQueryEngine(
    { id: 101, name: 'Current User' },
    now,
    { contacts: [{ id: 'u_5592_terry', name: 'Terry' }] }
  )

  it('builds a parameterized SQL query from the natural language request', () => {
    const result = engine.processNaturalQuery('Show me the receipts Terry uploaded last week')

    expect(result.filters.authorId).toBe('u_5592_terry')
    expect(result.filters.dateRange).toEqual({
      start: '2025-12-01T00:00:00.000Z',
      end: '2025-12-07T23:59:59.999Z'
    })

    expect(result.sql).toContain('SELECT * FROM files')
    expect(result.sql).toContain('ORDER BY upload_date DESC;')
    expect(result.params[0]).toBe('u_5592_terry')
    expect(result.params).toContain('financial document')
  })

  it('expands synonyms and defaults semantic filters even without a person reference', () => {
    const result = engine.processNaturalQuery('Find invoices from last month')

    expect(result.filters.authorId).toBeUndefined()
    expect(result.filters.semanticTags).toEqual(
      expect.arrayContaining(['invoice', 'receipt', 'proof of payment', 'purchase'])
    )
    expect(result.filters.fileTypes).toEqual(expect.arrayContaining(['pdf', 'jpg', 'png']))
    expect(result.params).toEqual(expect.arrayContaining(['pdf', 'jpg', 'png']))

    expect(result.filters.dateRange?.start.startsWith('2025-11-')).toBe(true)
    expect(result.filters.dateRange?.end.startsWith('2025-11-')).toBe(true)
  })
})
