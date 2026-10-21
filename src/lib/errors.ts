/** Maps Firebase error codes to user-facing messages without exposing internal details. */
const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'The email or password is incorrect.',
  'auth/wrong-password': 'The email or password is incorrect.',
  'auth/user-not-found': 'The email or password is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/email-already-in-use': 'An account with this email already exists. Try signing in instead.',
  'auth/weak-password': 'Choose a stronger password (at least 8 characters).',
  'auth/password-does-not-meet-requirements': 'The password does not meet the project’s password policy.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/requires-recent-login': 'For your security, confirm your password and try again.',
  'auth/operation-not-allowed': 'Email/password sign-in is not enabled for this Firebase project.',
  'auth/missing-password': 'Enter your password.',
  'auth/invalid-api-key': 'The Firebase configuration is invalid. Check the VITE_FIREBASE_* settings.',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'The Firebase configuration is invalid. Check the VITE_FIREBASE_* settings.',
  'permission-denied': 'You don’t have permission to do that. Try signing out and back in.',
  unavailable: 'The service is unreachable right now. Check your connection and try again.',
  'deadline-exceeded': 'The request took too long. Check your connection and try again.',
  'failed-precondition': 'The request couldn’t be completed. Reload the page and try again.',
  'resource-exhausted': 'The service is busy. Try again shortly.',
  'not-found': 'This record no longer exists.',
  aborted: 'Another change happened at the same time. Try again.',
}

export function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    return error.code
  }
  return null
}

export function friendlyError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const code = errorCode(error)
  if (code && MESSAGES[code]) return MESSAGES[code]
  if (error instanceof Error && (error.name === 'DuplicatePaymentError' || error.name === 'NotFoundError')) {
    return error.message
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'You appear to be offline. Reconnect and try again.'
  return fallback
}
