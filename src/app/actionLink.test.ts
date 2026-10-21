import { describe, expect, it, vi } from 'vitest'
import { moveFirebaseActionLinkIntoHash } from './actionLink'

describe('moveFirebaseActionLinkIntoHash', () => {
  it('moves a Firebase action query into the hash route', () => {
    const replaceState = vi.fn()
    const moved = moveFirebaseActionLinkIntoHash({ pathname: '/spendwise/', search: '?mode=resetPassword&oobCode=abc&apiKey=k&lang=en', hash: '' }, { replaceState })
    expect(moved).toBe(true)
    expect(replaceState).toHaveBeenCalledWith(null, '', '/spendwise/#/auth/action?mode=resetPassword&oobCode=abc&apiKey=k&lang=en')
  })

  it('leaves ordinary URLs alone', () => {
    const replaceState = vi.fn()
    expect(moveFirebaseActionLinkIntoHash({ pathname: '/spendwise/', search: '?utm=x', hash: '#/demo' }, { replaceState })).toBe(false)
    expect(replaceState).not.toHaveBeenCalled()
  })
})
