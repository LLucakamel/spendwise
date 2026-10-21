import { describe, expect, it } from 'vitest'
import { generateDemoData } from '@/data/demo/demoData'
import { searchEverything } from './globalSearch'

describe('searchEverything', () => {
  const data = generateDemoData('2026-03-15')

  it('needs at least two characters', () => {
    expect(searchEverything(data, 'g')).toEqual([])
  })

  it('finds transactions, categories, budgets and bills case-insensitively', () => {
    const results = searchEverything(data, 'GROCER')
    const types = new Set(results.map((r) => r.type))
    expect(types.has('transaction')).toBe(true)
    expect(types.has('category')).toBe(true)
    expect(types.has('budget')).toBe(true)
    expect(results.find((r) => r.type === 'category')).toMatchObject({ id: 'exp-groceries', path: '/transactions', query: { category: 'exp-groceries' } })
  })

  it('links transactions to their details and bills to the bills page', () => {
    const tx = searchEverything(data, 'greenleaf').find((r) => r.type === 'transaction')
    expect(tx?.query.open).toBeTruthy()
    const bill = searchEverything(data, 'internet').find((r) => r.type === 'bill')
    expect(bill).toMatchObject({ path: '/bills', query: { q: 'Brightwave Internet' }, currency: 'USD' })
  })

  it('limits results per type and returns nothing for unknown terms', () => {
    expect(searchEverything(data, 'market').filter((r) => r.type === 'transaction').length).toBeLessThanOrEqual(6)
    expect(searchEverything(data, 'zzzz-nothing')).toEqual([])
  })
})
