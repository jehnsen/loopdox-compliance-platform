'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRightIcon } from 'lucide-react'
import { authRequest, isApiError } from '@/lib/api/client'
import { ROLE_LABELS } from '@/lib/auth/permissions'
import type { Role } from '@/lib/api/types'
import { en } from '@/lib/i18n/en'
import { loginSchema, type LoginInput } from '@/lib/schemas/auth'
import { initials } from '@/lib/utils/format'
import { safeNext } from '@/lib/utils/safe-next'
import { FormError, FormField } from '@/components/form/form-field'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export interface MockUserOption {
  name: string
  email: string
  title: string | null
  orgs: { name: string; roles: Role[] }[]
}

export function LoginForm({
  next,
  reason,
  mockUsers,
}: {
  next: string | null
  reason: string | null
  mockUsers: MockUserOption[] | null
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })
  const destination = safeNext(next)

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await authRequest('login', values)
      window.location.assign(destination)
    } catch (e) {
      setFormError(
        isApiError(e) && e.status === 401
          ? en.auth.invalidCredentials
          : isApiError(e)
            ? e.message
            : en.states.errorBody,
      )
    }
  })

  const signInAs = async (email: string) => {
    setFormError(null)
    setPendingEmail(email)
    try {
      await authRequest('mock-login', { email })
      window.location.assign(destination)
    } catch (e) {
      setPendingEmail(null)
      setFormError(isApiError(e) ? e.message : en.states.errorBody)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {reason === 'idle' ? (
        <p role="status" className="rounded-md border border-line bg-surface px-3 py-2 text-base">
          {en.auth.signedOutIdle}
        </p>
      ) : null}
      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h1 className="text-lg font-semibold">{en.auth.signInTitle}</h1>
          <FormError message={formError} />
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <FormField label={en.auth.email} error={form.formState.errors.email?.message}>
              <Input type="email" autoComplete="username" {...form.register('email')} />
            </FormField>
            <FormField label={en.auth.password} error={form.formState.errors.password?.message}>
              <Input
                type="password"
                autoComplete="current-password"
                {...form.register('password')}
              />
            </FormField>
            <div className="flex items-center justify-between gap-2">
              <Link href="/forgot-password" className="link text-sm">
                {en.auth.forgotPassword}
              </Link>
              <Button type="submit" variant="primary" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? en.auth.signingIn : en.auth.signIn}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {mockUsers ? (
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <div>
              <h2 className="text-md font-semibold">{en.auth.mockSignInAs}</h2>
              <p className="text-sm text-muted">{en.auth.mockSignInHint}</p>
            </div>
            <ul className="flex flex-col gap-1.5" aria-label="Seeded users">
              {mockUsers.map((u) => (
                <li key={u.email}>
                  <button
                    type="button"
                    onClick={() => void signInAs(u.email)}
                    disabled={pendingEmail !== null}
                    data-testid={`sign-in-as-${u.email}`}
                    className="flex w-full items-center gap-3 rounded-md border border-line px-3 py-2 text-left hover:bg-surface-2 disabled:opacity-60"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                      {initials(u.name)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{u.name}</span>
                      <span className="truncate text-xs text-muted">
                        {u.orgs
                          .map(
                            (o) => `${o.name} (${o.roles.map((r) => ROLE_LABELS[r]).join(', ')})`,
                          )
                          .join(' · ')}
                      </span>
                    </span>
                    {pendingEmail === u.email ? (
                      <span className="text-xs text-muted">{en.auth.signingIn}</span>
                    ) : (
                      <ArrowRightIcon className="size-4 shrink-0 text-muted" aria-hidden="true" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
