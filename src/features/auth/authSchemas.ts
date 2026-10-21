import { z } from 'zod'

export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { id: 'letter', label: 'At least one letter', test: (p: string) => /[A-Za-z]/.test(p) },
  { id: 'number', label: 'At least one number', test: (p: string) => /\d/.test(p) },
] as const

const email = z.string().trim().min(1, 'Enter your email address.').pipe(z.email('Enter a valid email address.'))

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.'),
  remember: z.boolean(),
})

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.').max(60, 'Keep your name under 60 characters.'),
    email,
    password: z
      .string()
      .max(128, 'Use at most 128 characters.')
      .refine((p) => PASSWORD_RULES.every((r) => r.test(p)), 'The password doesn’t meet the requirements below.'),
    confirm: z.string().min(1, 'Confirm your password.'),
    acceptPrivacy: z.boolean().refine((v) => v, 'Please confirm you’ve read the privacy notice.'),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The passwords don’t match.' })

export const resetSchema = z.object({ email })

export type LoginValues = z.input<typeof loginSchema>
export type RegisterValues = z.input<typeof registerSchema>
export type ResetValues = z.input<typeof resetSchema>
