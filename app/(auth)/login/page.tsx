import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ACCESS_COOKIE } from '@/lib/auth/cookies'
import { serverEnv } from '@/lib/env'
import { callBackend } from '@/lib/server/backend'
import { safeNext } from '@/lib/utils/safe-next'
import { LoginForm, type MockUserOption } from '@/features/auth/login-form'

export const metadata: Metadata = { title: 'Sign in' }

async function mockUserOptions(): Promise<MockUserOption[] | null> {
  if (serverEnv.apiMode !== 'mock') return null
  const { getDb } = await import('@/mocks/store')
  const db = getDb()
  return db.users.map((u) => ({
    name: u.name,
    email: u.email,
    title: u.title,
    orgs: db.memberships
      .filter((m) => m.userId === u.id && m.status === 'active')
      .map((m) => ({
        name: db.orgs.find((o) => o.id === m.orgId)?.name ?? m.orgId,
        roles: m.roles,
      })),
  }))
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const sp = await searchParams
  const next = typeof sp.next === 'string' ? sp.next : null
  const reason = typeof sp.reason === 'string' ? sp.reason : null

  // Already signed in with a valid session: skip the form.
  const token = (await cookies()).get(ACCESS_COOKIE)?.value
  if (token && !reason) {
    const res = await callBackend({ method: 'GET', path: '/me', token })
    if (res.ok) redirect(safeNext(next))
  }

  return <LoginForm next={next} reason={reason} mockUsers={await mockUserOptions()} />
}
