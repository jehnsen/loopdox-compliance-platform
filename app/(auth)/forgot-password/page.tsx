import type { Metadata } from 'next'
import { ForgotPasswordForm } from '@/features/auth/password-forms'

export const metadata: Metadata = { title: 'Reset password' }

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />
}
