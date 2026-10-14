import type { Metadata } from 'next'
import Link from 'next/link'
import type { ApiErrorBody, InvitePreview } from '@/lib/api/types'
import { en } from '@/lib/i18n/en'
import { callBackend } from '@/lib/server/backend'
import { AcceptInviteForm } from '@/features/auth/password-forms'
import { Card, CardContent } from '@/components/ui/card'

export const metadata: Metadata = { title: 'Accept invite' }

export default async function AcceptInvitePage({ params }: PageProps<'/accept-invite/[token]'>) {
  const { token } = await params
  const res = await callBackend({
    method: 'GET',
    path: `/auth/invites/${encodeURIComponent(token)}`,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <h1 className="text-lg font-semibold">This invite can’t be used</h1>
          <p className="text-base text-muted">
            {body?.error.message ?? 'It may have expired.'} Ask the person who invited you to send a
            new one.
          </p>
          <Link href="/login" className="link text-sm">
            {en.auth.backToSignIn}
          </Link>
        </CardContent>
      </Card>
    )
  }
  return <AcceptInviteForm invite={(await res.json()) as InvitePreview} />
}
