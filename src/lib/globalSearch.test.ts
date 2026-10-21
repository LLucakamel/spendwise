import { describe, expect, it } from 'vitest'
import { generateDemoData } from '@/data/demo/demoData'
import { searchEverything } from './globalSearch'

describe('searchEverything', () => {
  const data = generateDemoData('2026-03-15', 'en')
  const categoryName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? 'Uncategorized'
  const search = (q: string, types?: Parameters<typeof searchEverything>[3]) => searchEverything(data, q, categoryName, types)

  it('needs at least two characters', () => {
    expect(search('g')).toEqual([])
  })

  it('finds transactions, categories and budgets case-insensitively', () => {
    const results = search('GROCER')
    const types = new Set(results.map((r) => r.type))
    expect(types.has('transaction')).toBe(true)
    expect(types.has('category')).toBe(true)
    expect(types.has('budget')).toBe(true)
    expect(results.find((r) => r.type === 'category')).toMatchObject({ id: 'exp-groceries', path: '/transactions', query: { category: 'exp-groceries' } })
  })

  it('links transactions, bills, income sources, invoices and accounts to their pages', () => {
    expect(search('green basket').find((r) => r.type === 'transaction')?.query.open).toBeTruthy()
    expect(search('internet').find((r) => r.type === 'bill')).toMatchObject({ path: '/bills', query: { q: 'Home fibre internet' }, currency: 'EGP' })
    expect(search('salary').find((r) => r.type === 'income')).toMatchObject({ path: '/income', query: { source: 'demo-inc-salary' } })
    expect(search('4242').find((r) => r.type === 'account')).toMatchObject({ id: 'demo-acc-card', query: { account: 'demo-acc-card' } })
  })

  it('respects the type filter', () => {
    expect(search('GROCER', ['budget']).every((r) => r.type === 'budget')).toBe(true)
  })

  it('limits results per type and returns nothing for unknown terms', () => {
    expect(search('market').filter((r) => r.type === 'transaction').length).toBeLessThanOrEqual(6)
    expect(search('zzzz-nothing')).toEqual([])
  })
})
