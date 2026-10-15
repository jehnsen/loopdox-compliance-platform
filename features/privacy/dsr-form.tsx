'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { EyeOffIcon } from 'lucide-react'
import { useCreateDsr } from '@/lib/api/hooks/use-privacy'
import { isApiError } from '@/lib/api/client'
import type { DsrChannel, DsrType } from '@/lib/api/types'
import { addDaysToDate, DSR_CHANNEL_LABELS, DSR_TYPE_LABELS } from '@/lib/privacy'
import { createDsrSchema, type DsrFormValues } from '@/lib/schemas/privacy'
import { formatCalendarDate, todayInTz } from '@/lib/utils/dates'
import { useSession } from '@/components/providers/session-provider'
import { DateField } from '@/components/form/date-field'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { PeoplePicker } from '@/components/form/people-picker'
import { RecordMultiPicker } from '@/components/form/record-picker'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { privacyPaths } from '@/features/privacy/paths'
import { privacyCrumbs } from '@/features/privacy/shared'

/** DSR intake. The requester's details are masked once saved. */
export function DsrForm() {
  const { org } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const create = useCreateDsr(org.slug)
  const [formError, setFormError] = useState<string | null>(null)
  const today = todayInTz(org.timezone)
  const form = useForm<DsrFormValues>({
    resolver: zodResolver(createDsrSchema),
    defaultValues: {
      type: 'access',
      requesterName: '',
      requesterContact: '',
      channel: 'email',
      description: '',
      receivedAt: today,
      assignee: null,
      processingActivityIds: searchParams.get('processing')
        ? [searchParams.get('processing') ?? '']
        : [],
    },
  })
  const { register, control, handleSubmit, setError, formState } = form
  const errors = formState.errors
  const receivedAt = useWatch({ control, name: 'receivedAt' })
  const days = org.settings.dsrResponseDays
  const due = /^\d{4}-\d{2}-\d{2}$/.test(receivedAt) ? addDaysToDate(receivedAt, days) : null

  const submit = handleSubmit((values) => {
    setFormError(null)
    create.mutate(values, {
      onSuccess: (d) => {
        toast.success(`Logged ${d.ref}, due ${formatCalendarDate(d.dueAt)}`)
        router.push(privacyPaths.requestView(org.slug, d.id))
      },
      onError: (e) => {
        if (isApiError(e) && applyFieldErrors(e.fields, setError)) {
          setFormError('Some fields need attention.')
          return
        }
        setFormError(isApiError(e) ? e.message : 'Couldn’t save the request. Try again.')
      },
    })
  })

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <PageHeader
        title="New data subject request"
        breadcrumbs={privacyCrumbs(
          { label: 'Data subject requests', href: privacyPaths.requests(org.slug) },
          { label: 'New' },
        )}
        className="pb-0"
      />
      <FormError message={formError} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader className="flex-col gap-1">
              <CardTitle className="text-base">Requester</CardTitle>
              <CardDescription className="flex items-start gap-1.5">
                <EyeOffIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Masked after you save. Only roles that can reveal identifiers see them, and every
                reveal is logged.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField label="Name" error={errors.requesterName?.message} required>
                <Input {...register('requesterName')} autoComplete="off" />
              </FormField>
              <FormField label="Email or phone" error={errors.requesterContact?.message} required>
                <Input {...register('requesterContact')} autoComplete="off" />
              </FormField>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">The request</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <FormField id="dsr-type" label="Type" error={errors.type?.message} required>
                      <Select
                        value={field.value}
                        onValueChange={(v) => field.onChange(v as DsrType)}
                      >
                        <SelectTrigger id="dsr-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(DSR_TYPE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>
                  )}
                />
                <Controller
                  control={control}
                  name="channel"
                  render={({ field }) => (
                    <FormField
                      id="dsr-channel"
                      label="Received by"
                      error={errors.channel?.message}
                      required
                    >
                      <Select
                        value={field.value}
                        onValueChange={(v) => field.onChange(v as DsrChannel)}
                      >
                        <SelectTrigger id="dsr-channel">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(DSR_CHANNEL_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>
                  )}
                />
              </div>
              <FormField
                label="What they asked for"
                hint="Describe the request without repeating their identifiers."
                error={errors.description?.message}
              >
                <Textarea {...register('description')} rows={4} />
              </FormField>
              <Controller
                control={control}
                name="processingActivityIds"
                render={({ field }) => (
                  <FormField
                    id="dsr-processing"
                    label="Processing records involved"
                    hint="Which activities hold this person’s data."
                  >
                    <RecordMultiPicker
                      type="processing_activity"
                      id="dsr-processing"
                      value={field.value}
                      onChange={field.onChange}
                      aria-describedby="dsr-processing-hint"
                    />
                  </FormField>
                )}
              />
            </CardContent>
          </Card>
        </div>
        <Card className="h-fit lg:sticky lg:top-18">
          <CardHeader>
            <CardTitle className="text-base">Deadline</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Controller
              control={control}
              name="receivedAt"
              render={({ field }) => (
                <FormField label="Received on" error={errors.receivedAt?.message} required>
                  <DateField
                    mode="date"
                    value={field.value}
                    onChange={field.onChange}
                    max={today}
                  />
                </FormField>
              )}
            />
            <div className="rounded-md bg-surface-2 px-3 py-2 text-sm" aria-live="polite">
              {due ? (
                <>
                  Due <strong className="font-semibold">{formatCalendarDate(due)}</strong>
                </>
              ) : (
                'Enter the received date.'
              )}
              <p className="mt-1 text-xs text-muted">
                {days}-day response period, set in organisation settings. A setting, not legal
                advice.
              </p>
            </div>
            <Controller
              control={control}
              name="assignee"
              render={({ field }) => (
                <FormField label="Assignee" error={errors.assignee?.message}>
                  <PeoplePicker
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Unassigned"
                  />
                </FormField>
              )}
            />
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button type="submit" variant="primary" disabled={create.isPending}>
                {create.isPending ? 'Saving…' : 'Log request'}
              </Button>
              <Button asChild variant="secondary">
                <Link href={privacyPaths.requests(org.slug)}>Cancel</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  )
}
