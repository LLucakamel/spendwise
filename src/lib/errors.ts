import type { MessageKey } from '@/i18n'

/** Maps Firebase and app error codes to translation keys without exposing internal details. */
const KEYS: Record<string, MessageKey> = {
  'auth/invalid-credential': 'errors.invalidCredential',
  'auth/wrong-password': 'errors.invalidCredential',
  'auth/user-not-found': 'errors.invalidCredential',
  'auth/invalid-email': 'errors.invalidEmail',
  'auth/expired-action-code': 'errors.actionExpired',
  'auth/invalid-action-code': 'errors.actionInvalid',
  'auth/email-already-in-use': 'errors.emailInUse',
  'auth/weak-password': 'errors.weakPassword',
  'auth/password-does-not-meet-requirements': 'errors.weakPassword',
  'auth/too-many-requests': 'errors.tooManyRequests',
  'auth/network-request-failed': 'errors.network',
  'auth/user-disabled': 'errors.userDisabled',
  'auth/requires-recent-login': 'errors.recentLogin',
  'auth/operation-not-allowed': 'errors.operationNotAllowed',
  'auth/invalid-api-key': 'errors.invalidConfig',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'errors.invalidConfig',
  'permission-denied': 'errors.permissionDenied',
  unavailable: 'errors.unavailable',
  'deadline-exceeded': 'errors.timeout',
  'not-found': 'errors.notFound',
  aborted: 'errors.aborted',
  'storage/unauthorized': 'errors.permissionDenied',
  'storage/unavailable': 'errors.storage',
  'storage/quota-exceeded': 'errors.storage',
}

export function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') return error.code
  return null
}

/** Translation key describing an error, or `fallback` when it isn't recognised. */
export function errorKey(error: unknown, fallback: MessageKey = 'errors.generic'): MessageKey {
  const code = errorCode(error)
  if (code && KEYS[code]) return KEYS[code]
  if (error instanceof Error && error.name === 'DuplicatePaymentError') return 'errors.duplicatePayment'
  if (error instanceof Error && error.name === 'NotFoundError') return 'errors.notFound'
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'errors.offline'
  return fallback
}
