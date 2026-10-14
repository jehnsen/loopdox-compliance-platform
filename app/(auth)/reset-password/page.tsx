import type { Metadata } from 'next'
import { ResetPasswordForm } from '@/features/auth/password-forms'

export const metadata: Metadata = { title: 'Choose a new password' }

export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  const { token } = await searchParams
  return <ResetPasswordForm token={typeof token === 'string' ? token : ''} />
}
