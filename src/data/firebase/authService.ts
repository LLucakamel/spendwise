import {
  applyActionCode,
  browserLocalPersistence,
  confirmPasswordReset,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  verifyPasswordResetCode,
  type Auth,
  type User,
} from 'firebase/auth'
import type { FirestoreRepository } from './firestoreRepository'

/**
 * Signs in with Firebase's own session persistence: "keep me signed in" uses local persistence
 * (survives browser restarts); otherwise the session ends when the browser session ends.
 * Credentials are never stored by the app.
 */
export async function signIn(auth: Auth, email: string, password: string, remember = true) {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence)
  return signInWithEmailAndPassword(auth, email.trim(), password)
}

export async function register(auth: Auth, name: string, email: string, password: string) {
  await setPersistence(auth, browserLocalPersistence)
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
  if (name.trim()) {
    await updateProfile(credential.user, { displayName: name.trim() }).catch(() => undefined)
    // Refreshing the token notifies listeners, so the new name shows up immediately.
    await credential.user.getIdToken(true).catch(() => undefined)
  }
  // Verification is encouraged but not required to use the app; failures here are non-fatal.
  sendEmailVerification(credential.user).catch(() => undefined)
  return credential
}

export function requestPasswordReset(auth: Auth, email: string) {
  return sendPasswordResetEmail(auth, email.trim())
}

/** Checks a password-reset link and returns the account's email address. */
export function verifyResetCode(auth: Auth, code: string) {
  return verifyPasswordResetCode(auth, code)
}

export function completePasswordReset(auth: Auth, code: string, newPassword: string) {
  return confirmPasswordReset(auth, code, newPassword)
}

/** Applies an email-verification link; a signed-in user is refreshed so the new state shows at once. */
export async function verifyEmailCode(auth: Auth, code: string) {
  await applyActionCode(auth, code)
  await auth.currentUser?.reload().catch(() => undefined)
  await auth.currentUser?.getIdToken(true).catch(() => undefined)
}

export function signOut(auth: Auth) {
  return firebaseSignOut(auth)
}

export function resendVerification(user: User) {
  return sendEmailVerification(user)
}

/**
 * Permanently deletes the signed-in user's data and then their Firebase Authentication account.
 * Re-authentication happens first so a stale session cannot leave the account half-deleted.
 */
export async function deleteAccount(user: User, password: string, repository: FirestoreRepository) {
  if (!user.email) throw new Error('This account has no email address.')
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password))
  await repository.deleteAllData()
  await deleteUser(user)
}
