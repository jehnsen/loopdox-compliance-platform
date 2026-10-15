'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { z } from 'zod'
import { AlarmClockIcon, CheckCircle2Icon } from 'lucide-react'
import { useReportIncident } from '@/lib/api/hooks/use-privacy'
import { isApiError } from '@/lib/api/client'
import type { IncidentReceipt } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { reportIncidentSchema } from '@/lib/schemas/privacy'
import { cn } from '@/lib/utils/cn'
import { formatDateTimeZone } from '@/lib/utils/dates'
import { useSession } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { DateField } from '@/components/form/date-field'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { privacyPaths } from '@/features/privacy/paths'

const formSchema = reportIncidentSchema.omit({ personalDataInvolved: true }).extend({
  personalData: z.enum(['yes', 'no', 'unsure'], {
    error: 'Say whether personal data may be involved.',
  }),
})
type FormValues = z.infer<typeof formSchema>

const PERSONAL_DATA_OPTIONS = [
  {
    value: 'yes',
    label: 'Yes',
    hint: 'Information about identifiable people was exposed, lost or changed.',
  },
  {
    value: 'unsure',
    label: 'Not sure yet',
    hint: 'We treat it as yes and start the clock, to be safe. Triage can change this.',
  },
  { value: 'no', label: 'No', hint: 'Only systems or company information were affected.' },
] as const

function Receipt({ receipt, onAnother }: { receipt: IncidentReceipt; onAnother: () => void }) {
  const { org } = useSession()
  return (
    <Card className="max-w-2xl" role="status" data-testid="incident-receipt">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <CheckCircle2Icon className="mt-0.5 size-6 shrink-0 text-ok" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h2 className="text-md font-semibold">
              Thank you. <IdChip>{receipt.ref}</IdChip> is with the privacy team.
            </h2>
            <p className="text-base">
              They’ve been notified and will follow up with you if they need more detail.
            </p>
          </div>
        </div>
        {receipt.notificationDeadline ? (
          <p className="flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-base">
            <AlarmClockIcon className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
            <span>
              Personal data may be involved, so the 72-hour clock for notifying the National Privacy
              Commission started when this was discovered. It runs out{' '}
              <strong className="font-semibold">
                {formatDateTimeZone(receipt.notificationDeadline, org.timezone)}
              </strong>
              .
            </span>
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onAnother}>
            Report another incident
          </Button>
          <Button asChild variant="primary">
            <Link href={`/${org.slug}`}>Back to Overview</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** "Report an incident": open to every role with incidents.report (staff included). */
export function ReportIncidentPage() {
  const { org } = useSession()
  const can = useCan()
  const router = useRouter()
  const report = useReportIncident(org.slug)
  const [receipt, setReceipt] = useState<IncidentReceipt | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: '', description: '', discoveredAt: '', affectedSummary: '' },
  })
  const { register, control, handleSubmit, setError, setValue, getValues, reset, formState } = form
  const errors = formState.errors

  // Default the discovery time to now, on the client only (no hydration mismatch).
  useEffect(() => {
    if (!getValues('discoveredAt')) {
      const now = new Date()
      now.setSeconds(0, 0)
      setValue('discoveredAt', now.toISOString())
    }
  }, [getValues, setValue, receipt])

  const submit = handleSubmit(({ personalData, ...values }) => {
    setFormError(null)
    report.mutate(
      { ...values, personalDataInvolved: personalData !== 'no' },
      {
        onSuccess: (r) => {
          if (can('privacy.read')) {
            toast.success(`Reported ${r.ref}`)
            router.push(privacyPaths.incidentView(org.slug, r.id))
          } else setReceipt(r)
        },
        onError: (e) => {
          if (isApiError(e) && applyFieldErrors(e.fields, setError)) {
            setFormError('Some fields need attention.')
            return
          }
          setFormError(isApiError(e) ? e.message : 'Couldn’t send the report. Try again.')
        },
      },
    )
  })

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Report an incident"
        breadcrumbs={
          can('privacy.read')
            ? [
                { label: 'Privacy' },
                { label: 'Incidents and breaches', href: privacyPaths.incidents(org.slug) },
                { label: 'Report' },
              ]
            : []
        }
        description="Tell the privacy team what happened, as soon as you notice. You don’t need every detail yet."
      />
      {receipt ? (
        <Receipt
          receipt={receipt}
          onAnother={() => {
            setReceipt(null)
            reset({ title: '', description: '', discoveredAt: '', affectedSummary: '' })
          }}
        />
      ) : (
        <form onSubmit={submit} noValidate className="flex max-w-2xl flex-col gap-4">
          <FormError message={formError} />
          <FormField label="What happened, in a few words" error={errors.title?.message} required>
            <Input
              {...register('title')}
              autoComplete="off"
              placeholder="For example: Laptop left in a taxi"
            />
          </FormField>
          <FormField
            label="What happened"
            hint="What you saw, when, and anything already done about it."
            error={errors.description?.message}
            required
          >
            <Textarea {...register('description')} rows={5} />
          </FormField>
          <Controller
            control={control}
            name="discoveredAt"
            render={({ field }) => (
              <FormField
                label="When was it discovered?"
                hint="The 72-hour notification clock runs from this time."
                error={errors.discoveredAt?.message}
                required
              >
                <DateField
                  mode="datetime"
                  value={field.value || null}
                  onChange={field.onChange}
                  timezone={org.timezone}
                />
              </FormField>
            )}
          />
          <FormField
            label="What’s affected?"
            hint="Systems, files, devices or records involved, if you know."
            error={errors.affectedSummary?.message}
          >
            <Textarea {...register('affectedSummary')} rows={3} />
          </FormField>
          <Controller
            control={control}
            name="personalData"
            render={({ field }) => (
              <fieldset
                className="flex flex-col gap-2"
                aria-describedby={errors.personalData ? 'pd-error' : undefined}
              >
                <legend className="mb-1 text-sm font-medium">
                  Could personal data be involved?{' '}
                  <span className="text-bad" aria-hidden="true">
                    *
                  </span>
                </legend>
                {PERSONAL_DATA_OPTIONS.map((o) => (
                  <label
                    key={o.value}
                    className={cn(
                      'flex cursor-pointer items-start gap-2.5 rounded-md border border-line bg-surface px-3 py-2',
                      field.value === o.value && 'border-accent bg-accent-soft',
                    )}
                  >
                    <input
                      type="radio"
                      name={field.name}
                      value={o.value}
                      checked={field.value === o.value}
                      onChange={() => field.onChange(o.value)}
                      className="mt-1 accent-(--accent)"
                    />
                    <span className="flex flex-col">
                      <span className="font-medium">{o.label}</span>
                      <span className="text-sm text-muted">{o.hint}</span>
                    </span>
                  </label>
                ))}
                {errors.personalData ? (
                  <p id="pd-error" className="text-sm text-bad">
                    {errors.personalData.message}
                  </p>
                ) : null}
              </fieldset>
            )}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={report.isPending}>
              {report.isPending ? 'Sending…' : 'Report incident'}
            </Button>
            <Button asChild variant="secondary">
              <Link href={can('privacy.read') ? privacyPaths.incidents(org.slug) : `/${org.slug}`}>
                Cancel
              </Link>
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
