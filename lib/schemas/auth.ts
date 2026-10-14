import { z } from 'zod'

export const emailSchema = z.email('Enter a valid email address.').trim().toLowerCase()

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
})
export type LoginInput = z.infer<typeof loginSchema>

export const forgotPasswordSchema = z.object({ email: emailSchema })
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export const newPasswordSchema = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .max(200, 'Use at most 200 characters.')

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: newPasswordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'The passwords don’t match.',
  })
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export const acceptInviteSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name.').max(120),
    password: newPasswordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'The passwords don’t match.',
  })
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>

export const refreshSchema = z.object({ refreshToken: z.string().min(1) })

/** Mock mode only: sign in as a seeded user without a password. */
export const mockLoginSchema = z.object({ email: emailSchema })
