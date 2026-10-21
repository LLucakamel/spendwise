import { z } from 'zod'
import type { MessageKey } from '@/i18n'

export const PASSWORD_RULES: { id: string; label: MessageKey; test: (p: string) => boolean }[] = [
  { id: 'length', label: 'auth.ruleLength', test: (p) => p.length >= 8 },
  { id: 'letter', label: 'auth.ruleLetter', test: (p) => /[A-Za-z؀-ۿ]/.test(p) },
  { id: 'number', label: 'auth.ruleNumber', test: (p) => /\d/.test(p) },
]

const email = z.string().trim().min(1, 'validation.emailRequired').pipe(z.email('validation.email'))

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'validation.passwordRequired'),
  remember: z.boolean(),
})

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'validation.nameRequired').max(60, 'validation.tooLong'),
    email,
    password: z
      .string()
      .max(128, 'validation.passwordTooLong')
      .refine((p) => PASSWORD_RULES.every((r) => r.test(p)), 'validation.passwordRules'),
    confirm: z.string().min(1, 'validation.confirmRequired'),
    acceptPrivacy: z.boolean().refine((v) => v, 'validation.privacyRequired'),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'validation.passwordMismatch' })

export const resetSchema = z.object({ email })

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .max(128, 'validation.passwordTooLong')
      .refine((p) => PASSWORD_RULES.every((r) => r.test(p)), 'validation.passwordRules'),
    confirm: z.string().min(1, 'validation.confirmRequired'),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'validation.passwordMismatch' })

export type LoginValues = z.input<typeof loginSchema>
export type RegisterValues = z.input<typeof registerSchema>
export type ResetValues = z.input<typeof resetSchema>
export type NewPasswordValues = z.input<typeof newPasswordSchema>
