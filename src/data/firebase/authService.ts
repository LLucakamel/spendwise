import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from 'firebase/auth'
import type { FirestoreRepository } from './firestoreRepository'

export function signIn(auth: Auth, email: string, password: string) {
  return signInWithEmailAndPassword(auth, email.trim(), password)
}

export async function register(auth: Auth, email: string, password: string) {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
  // Verification is encouraged but not required to use the app; failures here are non-fatal.
  sendEmailVerification(credential.user).catch(() => undefined)
  return credential
}

export function requestPasswordReset(auth: Auth, email: string) {
  return sendPasswordResetEmail(auth, email.trim())
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
