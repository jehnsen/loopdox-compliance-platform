'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useCreateAccessReview, useSystems } from '@/lib/api/hooks/use-security'
import { isApiError } from '@/lib/api/client'
import { createAccessReviewSchema, type CreateAccessReviewValues } from '@/lib/schemas/security'
import { periodEnd, periodOf } from '@/lib/security'
import { todayInTz } from '@/lib/utils/dates'
import { useSession } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { CalendarDate } from '@/components/date-text'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { PeoplePicker } from '@/components/form/people-picker'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { securityPaths } from '@/features/security/paths'
import { securityCrumbs } from '@/features/security/shared'

/** Start a review: choose the period, the systems to cover and the reviewer. */
export function ReviewForm() {
  const { org, user } = useSession()
  const router = useRouter()
  const create = useCreateAccessReview(org.slug)
  const systems = useSystems(org.slug, { pageSize: 200, sort: 'name' })
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<CreateAccessReviewValues>({
    resolver: zodResolver(createAccessReviewSchema),
    defaultValues: {
      period: periodOf(todayInTz(org.timezone)),
      systemIds: [],
      reviewer: user.id,
    },
  })
  const { control, register, handleSubmit, setError, formState } = form
  const errors = formState.errors
  const period = useWatch({ control, name: 'period' })
  const validPeriod = /^\d{4}-Q[1-4]$/.test(period)

  const submit = handleSubmit((values) => {
    setFormError(null)
    create.mutate(values, {
      onSuccess: (r) => {
        toast.success(`Started ${r.ref}: ${r.total} grants to review`)
        router.push(securityPaths.reviewView(org.slug, r.id))
      },
      onError: (e) => {
        if (isApiError(e) && applyFieldErrors(e.fields, setError)) {
          setFormError(e.message)
          return
        }
        setFormError(isApiError(e) ? e.message : 'Couldn’t start the review. Try again.')
      },
    })
  })

  const items = systems.data?.items ?? []
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <PageHeader
        title="Start an access review"
        breadcrumbs={securityCrumbs(
          { label: 'Access reviews', href: securityPaths.reviews(org.slug) },
          { label: 'New' },
        )}
        className="pb-0"
      />
      <FormError message={formError} />
      <Card className="max-w-3xl">
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Period"
              hint={
                validPeriod ? (
                  <>
                    Ends <CalendarDate value={periodEnd(period)} />.
                  </>
                ) : (
                  'Year and quarter, like 2026-Q4.'
                )
              }
              error={errors.period?.message}
              required
            >
              <Input {...register('period')} autoComplete="off" />
            </FormField>
            <Controller
              control={control}
              name="reviewer"
              render={({ field }) => (
                <FormField label="Reviewer" error={errors.reviewer?.message} required>
                  <PeoplePicker value={field.value} onChange={field.onChange} />
                </FormField>
              )}
            />
          </div>
          <Controller
            control={control}
            name="systemIds"
            render={({ field }) => (
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">
                  Systems to review{' '}
                  <span className="text-bad" aria-hidden="true">
                    *
                  </span>
                </legend>
                <p className="text-sm text-muted">
                  The review lists every active access grant on these systems.
                </p>
                <div className="flex gap-3 text-sm">
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() =>
                      field.onChange(items.filter((s) => s.grantCount > 0).map((s) => s.id))
                    }
                  >
                    Select all with access
                  </Button>
                  <Button type="button" variant="link" size="sm" onClick={() => field.onChange([])}>
                    Clear
                  </Button>
                </div>
                <ul className="divide-y divide-line rounded-md border border-line">
                  {items.map((s) => {
                    const checked = field.value.includes(s.id)
                    return (
                      <li key={s.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-2">
                          <Checkbox
                            checked={checked}
                            disabled={s.grantCount === 0}
                            onCheckedChange={(v) =>
                              field.onChange(
                                v === true
                                  ? [...field.value, s.id]
                                  : field.value.filter((x) => x !== s.id),
                              )
                            }
                          />
                          <IdChip>{s.ref}</IdChip>
                          <span className="min-w-0 flex-1 truncate">{s.name}</span>
                          <span className="text-sm text-muted tabular-nums">
                            {s.grantCount === 0
                              ? 'No access grants'
                              : `${s.grantCount} ${s.grantCount === 1 ? 'grant' : 'grants'}`}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
                {errors.systemIds ? (
                  <p className="text-sm text-bad">{errors.systemIds.message}</p>
                ) : null}
              </fieldset>
            )}
          />
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button type="submit" variant="primary" disabled={create.isPending}>
              {create.isPending ? 'Starting…' : 'Start review'}
            </Button>
            <Button asChild variant="secondary">
              <Link href={securityPaths.reviews(org.slug)}>Cancel</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
