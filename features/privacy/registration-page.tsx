'use client'

import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { AlarmClockIcon, LandmarkIcon, PencilIcon, PlusIcon, RefreshCwIcon } from 'lucide-react'
import { useRegistrations, useSaveRegistration } from '@/lib/api/hooks/use-privacy'
import { isApiError } from '@/lib/api/client'
import type { RegistrationSummary } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { registrationFormSchema, type RegistrationFormValues } from '@/lib/schemas/privacy'
import { addMonthsToDate, todayInTz } from '@/lib/utils/dates'
import { useSession } from '@/components/providers/session-provider'
import { ActivityFeed } from '@/components/activity-feed'
import { CalendarDate } from '@/components/date-text'
import { DateField } from '@/components/form/date-field'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { PageHeader } from '@/components/page-header'
import { EmptyState, ErrorState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { DetailSkeleton, Field, privacyCrumbs } from '@/features/privacy/shared'

type Mode = 'create' | 'edit' | 'renew'

function RegistrationDialog({
  mode,
  registration,
  onClose,
}: {
  mode: Mode
  registration: RegistrationSummary | null
  onClose: () => void
}) {
  const { org, user } = useSession()
  const save = useSaveRegistration(org.slug, registration?.id ?? null)
  const [error, setError] = useState<string | null>(null)
  const today = todayInTz(org.timezone)
  const defaults: RegistrationFormValues = registration
    ? {
        reference: registration.reference,
        dpoName: registration.dpoName,
        dpoEmail: registration.dpoEmail,
        notes: registration.notes,
        registeredAt: mode === 'renew' ? today : registration.registeredAt,
        renewsAt:
          mode === 'renew' ? addMonthsToDate(registration.renewsAt, 12) : registration.renewsAt,
      }
    : {
        reference: '',
        dpoName: user.name,
        dpoEmail: user.email,
        notes: '',
        registeredAt: today,
        renewsAt: addMonthsToDate(today, 12),
      }
  const form = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationFormSchema),
    defaultValues: defaults,
  })
  const { register, control, handleSubmit, setError: setFieldError, formState } = form
  const errors = formState.errors
  const submit = handleSubmit((v) =>
    save.mutate(
      { ...v, ...(registration ? { ifVersion: registration.version } : {}) },
      {
        onSuccess: () => {
          toast.success(mode === 'renew' ? 'Renewal recorded' : 'Registration saved')
          onClose()
        },
        onError: (e) => {
          if (isApiError(e) && applyFieldErrors(e.fields, setFieldError)) return
          setError(
            isApiError(e) && e.isConflict
              ? 'Someone changed the registration. Close this and try again.'
              : isApiError(e)
                ? e.message
                : 'Couldn’t save. Try again.',
          )
        },
      },
    ),
  )
  const title =
    mode === 'create'
      ? 'Add NPC registration'
      : mode === 'renew'
        ? 'Record renewal'
        : 'Edit registration'
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {mode === 'renew'
                ? 'Enter the dates from the renewed certificate.'
                : 'The details on your certificate of registration with the National Privacy Commission.'}
            </DialogDescription>
          </DialogHeader>
          <FormError message={error} />
          {mode !== 'renew' ? (
            <>
              <FormField label="Registration reference" error={errors.reference?.message} required>
                <Input {...register('reference')} className="font-mono" autoComplete="off" />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="DPO on record" error={errors.dpoName?.message} required>
                  <Input {...register('dpoName')} autoComplete="off" />
                </FormField>
                <FormField label="DPO email" error={errors.dpoEmail?.message} required>
                  <Input {...register('dpoEmail')} type="email" autoComplete="off" />
                </FormField>
              </div>
            </>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="registeredAt"
              render={({ field }) => (
                <FormField
                  label={mode === 'renew' ? 'Renewed on' : 'Registered on'}
                  error={errors.registeredAt?.message}
                  required
                >
                  <DateField mode="date" value={field.value} onChange={field.onChange} />
                </FormField>
              )}
            />
            <Controller
              control={control}
              name="renewsAt"
              render={({ field }) => (
                <FormField label="Renews on" error={errors.renewsAt?.message} required>
                  <DateField mode="date" value={field.value} onChange={field.onChange} />
                </FormField>
              )}
            />
          </div>
          {mode !== 'renew' ? (
            <FormField label="Notes" error={errors.notes?.message}>
              <Textarea {...register('notes')} rows={2} />
            </FormField>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {mode === 'renew' ? 'Record renewal' : 'Save registration'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** NPC registration: one card with the reference, DPO on record, dates, reminder and history. */
export function RegistrationPage() {
  const { org } = useSession()
  const can = useCan()
  const list = useRegistrations(org.slug)
  const [mode, setMode] = useState<Mode | null>(null)
  const reg = list.data?.items[0] ?? null
  const edit = can('privacy.edit')

  return (
    <div className="flex flex-col">
      <PageHeader
        title="NPC registration"
        breadcrumbs={privacyCrumbs({ label: 'NPC registration' })}
        description="The organisation’s registration with the National Privacy Commission and its data protection officer on record."
      />
      {list.isLoading ? (
        <DetailSkeleton />
      ) : list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : !reg ? (
        <EmptyState
          icon={LandmarkIcon}
          title="No registration on record"
          body="Add your NPC registration so renewals are tracked and the DPO on record appears on breach notices."
          actions={
            edit ? (
              <Button variant="primary" onClick={() => setMode('create')}>
                <PlusIcon aria-hidden="true" /> Add registration
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex flex-col gap-4">
            {reg.status !== 'registered' ? (
              <p
                role="status"
                className={
                  reg.status === 'expired'
                    ? 'flex items-start gap-2 rounded-lg border border-bad/30 bg-bad-soft px-4 py-3'
                    : 'flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3'
                }
              >
                <AlarmClockIcon
                  className={
                    reg.status === 'expired' ? 'mt-0.5 size-5 text-bad' : 'mt-0.5 size-5 text-warn'
                  }
                  aria-hidden="true"
                />
                <span>
                  {reg.status === 'expired' ? (
                    <>
                      The registration expired {-reg.daysToRenewal} days ago, on{' '}
                      <CalendarDate value={reg.renewsAt} />. Renew it with the NPC and record the
                      renewal here.
                    </>
                  ) : (
                    <>
                      Renewal is due in {reg.daysToRenewal} days, on{' '}
                      <CalendarDate value={reg.renewsAt} />. Start the renewal with the NPC.
                    </>
                  )}
                </span>
              </p>
            ) : null}
            <Card data-testid="registration-card">
              <CardHeader className="flex-wrap">
                <div className="flex flex-col gap-1">
                  <span className="label-caps">Registration reference</span>
                  <CardTitle className="font-mono text-lg">{reg.reference}</CardTitle>
                </div>
                <StatusPill status={reg.status} />
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Registrar">National Privacy Commission</Field>
                  <Field label="DPO on record">
                    <span className="flex flex-col">
                      <span>{reg.dpoName}</span>
                      <a
                        href={`mailto:${reg.dpoEmail}`}
                        className="text-sm text-accent hover:underline"
                      >
                        {reg.dpoEmail}
                      </a>
                    </span>
                  </Field>
                  <Field label="Registered">
                    <CalendarDate value={reg.registeredAt} />
                  </Field>
                  <Field label="Renews">
                    <span className="flex flex-col">
                      <CalendarDate value={reg.renewsAt} />
                      <span className="text-sm text-muted">
                        {reg.daysToRenewal >= 0
                          ? `in ${reg.daysToRenewal} days`
                          : `${-reg.daysToRenewal} days ago`}
                      </span>
                    </span>
                  </Field>
                </dl>
                {reg.notes ? <p className="text-base text-muted">{reg.notes}</p> : null}
                <p className="text-sm text-muted">
                  Flagged here from 30 days before the renewal date. The DPO on record appears on
                  breach notices.
                </p>
                {edit ? (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" onClick={() => setMode('renew')}>
                      <RefreshCwIcon aria-hidden="true" /> Record renewal
                    </Button>
                    <Button variant="secondary" onClick={() => setMode('edit')}>
                      <PencilIcon aria-hidden="true" /> Edit details
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">History</CardTitle>
            </CardHeader>
            <CardContent>
              {reg ? (
                <ActivityFeed targetType="registration" targetId={reg.id} />
              ) : (
                <Skeleton className="h-20" />
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {mode ? (
        <RegistrationDialog mode={mode} registration={reg} onClose={() => setMode(null)} />
      ) : null}
    </div>
  )
}
