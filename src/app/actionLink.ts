/**
 * Firebase email links (password reset, email verification) append `?mode=…&oobCode=…` to the
 * project's action URL. With hash routing that query sits before the `#`, so it is moved into the
 * `#/auth/action` route once, before the app renders. Other URLs are left untouched.
 */
export function moveFirebaseActionLinkIntoHash(location: Pick<Location, 'pathname' | 'search' | 'hash'>, history: Pick<History, 'replaceState'>): boolean {
  const params = new URLSearchParams(location.search)
  if (!params.get('mode') || !params.get('oobCode')) return false
  history.replaceState(null, '', `${location.pathname}#/auth/action?${params.toString()}`)
  return true
}
