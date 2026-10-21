import { describe, expect, it } from 'vitest'
import { snapshot } from '@/test/renderApp'
import { tx } from '@/test/factories'
import { DEMO_STORAGE_KEY, DemoRepository } from './demoRepository'

describe('DemoRepository', () => {
  it('generates fictional sample data on first use and persists it under its own versioned key', async () => {
    expect(window.localStorage.getItem(DEMO_STORAGE_KEY)).toBeNull()
    const repo = new DemoRepository()
    const data = await snapshot(repo)
    expect(data.transactions.length).toBeGreaterThan(0)
    const stored = JSON.parse(window.localStorage.getItem(DEMO_STORAGE_KEY) ?? '{}') as { version: number }
    expect(stored.version).toBe(2)
    expect(DEMO_STORAGE_KEY).toBe('spendwise.demo.v2')
  })

  it('keeps changes across reloads (a new repository instance)', async () => {
    const first = new DemoRepository()
    const { id: _id, createdAt: _c, updatedAt: _u, ...input } = tx({ description: 'Persisted coffee' })
    void _id
    void _c
    void _u
    await first.createTransaction('demo-persist-1', input)
    const reloaded = await snapshot(new DemoRepository())
    expect(reloaded.transactions.some((t) => t.id === 'demo-persist-1' && t.description === 'Persisted coffee')).toBe(true)
  })

  it('resets to sample data and clears to an empty sandbox', async () => {
    const repo = new DemoRepository()
    await repo.deleteAllData()
    let data = await snapshot(repo)
    expect(data.transactions).toEqual([])
    expect(data.categories.length).toBeGreaterThan(0)
    await repo.resetToSample()
    data = await snapshot(repo)
    expect(data.transactions.length).toBeGreaterThan(0)
  })

  it('only touches its own storage key', async () => {
    window.localStorage.setItem('unrelated', 'keep me')
    const repo = new DemoRepository()
    await repo.deleteAllData()
    const keys = Object.keys(window.localStorage)
    expect(keys.sort()).toEqual([DEMO_STORAGE_KEY, 'unrelated'].sort())
    expect(window.localStorage.getItem('unrelated')).toBe('keep me')
  })

  it('recovers from corrupted storage by starting fresh', async () => {
    window.localStorage.setItem(DEMO_STORAGE_KEY, '{not json')
    const data = await snapshot(new DemoRepository())
    expect(data.transactions.length).toBeGreaterThan(0)
  })
})
