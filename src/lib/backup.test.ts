import { describe, expect, it } from 'vitest'
import { generateDemoData } from '@/data/demo/demoData'
import { createBackup, parseBackup } from './backup'

describe('backup', () => {
  const data = generateDemoData('2026-03-15')

  it('round-trips a full backup', () => {
    const backup = createBackup(data, 'account', new Date('2026-03-15T12:00:00Z'))
    const parsed = parseBackup(JSON.stringify(backup))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.backup.data.transactions).toHaveLength(data.transactions.length)
      expect(parsed.backup.source).toBe('account')
    }
  })

  it('rejects invalid JSON, foreign files and invalid records', () => {
    expect(parseBackup('{').ok).toBe(false)
    expect(parseBackup(JSON.stringify({ hello: 'world' })).ok).toBe(false)
    const backup = createBackup(data, 'account')
    const tampered = structuredClone(backup)
    tampered.data.transactions[0]!.amountMinor = -5
    expect(parseBackup(JSON.stringify(tampered)).ok).toBe(false)
  })

  it('rejects records pointing at missing categories', () => {
    const backup = createBackup(data, 'account')
    backup.data.categories = backup.data.categories.filter((c) => c.id !== 'exp-groceries')
    const result = parseBackup(JSON.stringify(backup))
    expect(result.ok).toBe(false)
  })
})

describe('demo data', () => {
  it('is valid, fictional and never dated in the future', () => {
    const data = generateDemoData('2026-03-15')
    expect(data.transactions.length).toBeGreaterThan(50)
    expect(data.transactions.every((t) => t.date <= '2026-03-15')).toBe(true)
    expect(new Set(data.transactions.map((t) => t.id)).size).toBe(data.transactions.length)
    expect(parseBackup(JSON.stringify(createBackup(data, 'demo'))).ok).toBe(true)
  })
})
