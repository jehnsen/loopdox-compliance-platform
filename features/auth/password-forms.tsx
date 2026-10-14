'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { authRequest, isApiError } from '@/lib/api/client'
import type { InvitePreview } from '@/lib/api/types'
import { ROLE_LABELS } from '@/lib/auth/permissions'
import { en } from '@/lib/i18n/en'
import {
  acceptInviteSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type AcceptInviteInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from '@/lib/schemas/auth'
import { formatDate } from '@/lib/utils/dates'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

function BackToSignIn() {
  return (
    <Link href="/login" className="link text-sm">
      {en.auth.backToSignIn}
    </Link>
  )
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })
  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await authRequest('forgot-password', values)
      setSent(true)
    } catch (e) {
      setFormError(isApiError(e) ? e.message : en.states.errorBody)
    }
  })
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">{en.auth.forgotTitle}</h1>
          <p className="text-base text-muted">{en.auth.forgotBody}</p>
        </div>
        {sent ? (
          <p role="status" className="rounded-md bg-ok-soft px-3 py-2 text-base">
            {en.auth.forgotSent}
          </p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <FormError message={formError} />
            <FormField label={en.auth.email} error={form.formState.errors.email?.message}>
              <Input type="email" autoComplete="email" {...form.register('email')} />
            </FormField>
            <Button type="submit" variant="primary" disabled={form.formState.isSubmitting}>
              {en.auth.sendResetLink}
            </Button>
          </form>
        )}
        <BackToSignIn />
      </CardContent>
    </Card>
  )
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [done, setDone] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: '', confirm: '' },
  })
  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await authRequest('reset-password', values)
      setDone(true)
    } catch (e) {
      if (isApiError(e) && applyFieldErrors(e.fields, form.setError)) return
      setFormError(isApiError(e) ? e.message : en.states.errorBody)
    }
  })
  if (!token) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <h1 className="text-lg font-semibold">{en.auth.resetTitle}</h1>
          <FormError message="This reset link is incomplete. Open the link from your email again, or request a new one." />
          <Link href="/forgot-password" className="link text-sm">
            Request a new reset link
          </Link>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <h1 className="text-lg font-semibold">{en.auth.resetTitle}</h1>
        {done ? (
          <p role="status" className="rounded-md bg-ok-soft px-3 py-2 text-base">
            {en.auth.resetDone}
          </p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <FormError message={formError} />
            <FormField
              label={en.auth.newPassword}
              hint="At least 12 characters."
              error={form.formState.errors.password?.message}
            >
              <Input type="password" autoComplete="new-password" {...form.register('password')} />
            </FormField>
            <FormField
              label={en.auth.confirmPassword}
              error={form.formState.errors.confirm?.message}
            >
              <Input type="password" autoComplete="new-password" {...form.register('confirm')} />
            </FormField>
            <Button type="submit" variant="primary" disabled={form.formState.isSubmitting}>
              {en.auth.savePassword}
            </Button>
          </form>
        )}
        <BackToSignIn />
      </CardContent>
    </Card>
  )
}

export function AcceptInviteForm({ invite }: { invite: InvitePreview }) {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<AcceptInviteInput>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: { name: '', password: '', confirm: '' },
  })
  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await authRequest(`invites/${encodeURIComponent(invite.token)}/accept`, values)
      router.replace('/select-org')
    } catch (e) {
      if (isApiError(e) && applyFieldErrors(e.fields, form.setError)) return
      setFormError(isApiError(e) ? e.message : en.states.errorBody)
    }
  })
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">{en.auth.acceptInviteTitle}</h1>
          <p className="text-base text-muted">
            {invite.invitedBy} invited <span className="font-medium text-fg">{invite.email}</span>{' '}
            to <span className="font-medium text-fg">{invite.orgName}</span> as{' '}
            {invite.roles.map((r) => ROLE_LABELS[r]).join(', ')}. The invite expires on{' '}
            {formatDate(invite.expiresAt)}.
          </p>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <FormError message={formError} />
          <FormField label="Full name" error={form.formState.errors.name?.message}>
            <Input autoComplete="name" {...form.register('name')} />
          </FormField>
          <FormField
            label="Password"
            hint="At least 12 characters."
            error={form.formState.errors.password?.message}
          >
            <Input type="password" autoComplete="new-password" {...form.register('password')} />
          </FormField>
          <FormField label={en.auth.confirmPassword} error={form.formState.errors.confirm?.message}>
            <Input type="password" autoComplete="new-password" {...form.register('confirm')} />
          </FormField>
          <Button type="submit" variant="primary" disabled={form.formState.isSubmitting}>
            {en.auth.acceptInvite}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
