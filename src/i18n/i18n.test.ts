import { describe, expect, it } from 'vitest'
import { ar } from './ar'
import { en } from './en'
import { translate } from './index'

type Tree = { [key: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out.set(key, v)
    else for (const [ck, cv] of flatten(v, key)) out.set(ck, cv)
  }
  return out
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
const base = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, '')

describe('dictionaries', () => {
  const enKeys = flatten(en as unknown as Tree)
  const arKeys = flatten(ar as unknown as Tree)

  it('Arabic covers every English message (plural forms may differ)', () => {
    const arBases = new Set([...arKeys.keys()].map(base))
    const missing = [...enKeys.keys()].filter((k) => !arKeys.has(k) && !arBases.has(base(k)))
    expect(missing).toEqual([])
    const extra = [...arKeys.keys()].filter((k) => !enKeys.has(k) && ![...enKeys.keys()].some((e) => base(e) === base(k)))
    expect(extra).toEqual([])
  })

  it('uses the same placeholders in both languages', () => {
    const mismatched: string[] = []
    for (const [key, value] of enKeys) {
      const other = arKeys.get(key)
      if (other === undefined) continue
      const a = placeholders(value).filter((p) => p !== 'count')
      const b = placeholders(other).filter((p) => p !== 'count')
      if (a.join() !== b.join()) mismatched.push(key)
    }
    expect(mismatched).toEqual([])
  })

  it('selects plural forms per language', () => {
    expect(translate('en', 'bills.timing.overdue', { count: 1 })).toBe('Overdue by 1 day')
    expect(translate('en', 'bills.timing.overdue', { count: 3 })).toBe('Overdue by 3 days')
    expect(translate('ar', 'bills.timing.overdue', { count: 3 })).not.toBe(translate('ar', 'bills.timing.overdue', { count: 1 }))
  })

  it('falls back to English for unknown keys rather than crashing', () => {
    expect(translate('ar', 'common.cancel')).not.toBe('common.cancel')
  })
})
