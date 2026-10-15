'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useSaveRisk } from '@/lib/api/hooks/use-security'
import { api, isApiError, orgPath } from '@/lib/api/client'
import type { RiskSummary, RiskTreatment, Score } from '@/lib/api/types'
import { riskScore } from '@/lib/risk'
import { riskFormSchema, type RiskFormValues } from '@/lib/schemas/security'
import { TREATMENT_LABELS } from '@/lib/security'
import { addMonthsToDate, todayInTz } from '@/lib/utils/dates'
import { useSession } from '@/components/providers/session-provider'
import { ConflictDialog } from '@/components/conflict-dialog'
import { DateField } from '@/components/form/date-field'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { PeoplePicker } from '@/components/form/people-picker'
import { RecordMultiPicker } from '@/components/form/record-picker'
import { ScoreInput } from '@/components/form/score-input'
import { PageHeader } from '@/components/page-header'
import { ScoreBadge } from '@/components/risk-matrix'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useRecordConflict } from '@/features/privacy/use-conflict'
import { securityPaths } from '@/features/security/paths'
import { securityCrumbs } from '@/features/security/shared'

function valuesOf(r: RiskSummary): RiskFormValues {
  return {
    title: r.title,
    description: r.description,
    likelihood: r.likelihood,
    impact: r.impact,
    treatment: r.treatment,
    residualLikelihood: r.residualLikelihood,
    residualImpact: r.residualImpact,
    owner: r.owner,
    reviewAt: r.reviewAt,
    status: r.status,
    documentIds: r.documentIds,
    controlIds: r.controlIds,
  }
}

function describe(v: RiskFormValues): string {
  return [
    `Title: ${v.title}`,
    `Likelihood × impact: ${v.likelihood} × ${v.impact}`,
    `Treatment: ${TREATMENT_LABELS[v.treatment]}`,
    `Residual: ${v.residualLikelihood && v.residualImpact ? `${v.residualLikelihood} × ${v.residualImpact}` : 'Not assessed'}`,
    `Review: ${v.reviewAt}`,
    `Status: ${v.status}`,
    `Policies: ${v.documentIds.length}`,
    `Controls: ${v.controlIds.length}`,
    `Description: ${v.description}`,
  ].join('\n')
}

export function RiskForm({ record }: { record?: RiskSummary }) {
  const { org, user } = useSession()
  const router = useRouter()
  const save = useSaveRisk(org.slug, record?.id)
  const [formError, setFormError] = useState<string | null>(null)
  const [baseVersion, setBaseVersion] = useState(record?.version ?? 0)
  const form = useForm<RiskFormValues>({
    resolver: zodResolver(riskFormSchema),
    defaultValues: record
      ? valuesOf(record)
      : {
          title: '',
          description: '',
          likelihood: 3,
          impact: 3,
          treatment: 'mitigate',
          residualLikelihood: null,
          residualImpact: null,
          owner: user.id,
          reviewAt: addMonthsToDate(todayInTz(org.timezone), 3),
          status: 'open',
          documentIds: [],
          controlIds: [],
        },
  })
  const { register, control, handleSubmit, setError, setValue, getValues, reset, formState } = form
  const errors = formState.errors
  const [likelihood, impact, resL, resI] = useWatch({
    control,
    name: ['likelihood', 'impact', 'residualLikelihood', 'residualImpact'],
  })
  const assessed = resL !== null && resI !== null
  const conflict = useRecordConflict(
    () => api.get<RiskSummary>(orgPath(org.slug, `/risks/${record?.id ?? ''}`)),
    (r) => describe(valuesOf(r)),
  )

  const submit = (values: RiskFormValues, ifVersion = baseVersion) => {
    setFormError(null)
    const onError = (e: unknown) => {
      if (isApiError(e) && e.isConflict && record) return conflict.start()
      if (isApiError(e) && applyFieldErrors(e.fields, setError)) {
        setFormError('Some fields need attention.')
        return
      }
      setFormError(isApiError(e) ? e.message : 'Couldn’t save. Try again.')
    }
    save.mutate(record ? { ...values, ifVersion } : values, {
      onSuccess: (r) => {
        toast.success(record ? `Saved ${r.ref}` : `Added ${r.ref}`)
        router.push(securityPaths.riskView(org.slug, r.id))
      },
      onError,
    })
  }

  const cancelHref = record
    ? securityPaths.riskView(org.slug, record.id)
    : securityPaths.risks(org.slug)

  return (
    <form onSubmit={handleSubmit((v) => submit(v))} noValidate className="flex flex-col gap-4">
      <PageHeader
        title={record ? `Edit ${record.ref}` : 'New risk'}
        breadcrumbs={securityCrumbs(
          { label: 'Risks', href: securityPaths.risks(org.slug) },
          ...(record ? [{ label: record.ref, href: cancelHref }] : []),
          { label: record ? 'Edit' : 'New' },
        )}
        className="pb-0"
      />
      <FormError message={formError} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <FormField
              label="Risk"
              hint="What could go wrong, in one line."
              error={errors.title?.message}
              required
            >
              <Input {...register('title')} autoComplete="off" />
            </FormField>
            <FormField label="Description" error={errors.description?.message}>
              <Textarea {...register('description')} rows={3} />
            </FormField>
            <Controller
              control={control}
              name="documentIds"
              render={({ field }) => (
                <FormField
                  id="risk-docs"
                  label="Policies that treat it"
                  error={errors.documentIds?.message}
                >
                  <RecordMultiPicker
                    type="document"
                    id="risk-docs"
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormField>
              )}
            />
            <Controller
              control={control}
              name="controlIds"
              render={({ field }) => (
                <FormField
                  id="risk-controls"
                  label="Controls that treat it"
                  error={errors.controlIds?.message}
                >
                  <RecordMultiPicker
                    type="control"
                    id="risk-controls"
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormField>
              )}
            />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rating</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Controller
                control={control}
                name="likelihood"
                render={({ field }) => (
                  <FormField id="risk-l" label="Likelihood" required>
                    <ScoreInput
                      kind="likelihood"
                      id="risk-l"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormField>
                )}
              />
              <Controller
                control={control}
                name="impact"
                render={({ field }) => (
                  <FormField id="risk-i" label="Impact" required>
                    <ScoreInput
                      kind="impact"
                      id="risk-i"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormField>
                )}
              />
              <p className="flex items-center gap-2 text-sm">
                Inherent score <ScoreBadge score={riskScore(likelihood, impact)} />
              </p>
              <Controller
                control={control}
                name="treatment"
                render={({ field }) => (
                  <FormField id="risk-treatment" label="Treatment" required>
                    <Select
                      value={field.value}
                      onValueChange={(v) => field.onChange(v as RiskTreatment)}
                    >
                      <SelectTrigger id="risk-treatment">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TREATMENT_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                )}
              />
              <div className="flex flex-col gap-3 rounded-md border border-line p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={assessed}
                    onCheckedChange={(v) => {
                      const on = v === true
                      setValue(
                        'residualLikelihood',
                        on ? (Math.max(1, likelihood - 1) as Score) : null,
                        {
                          shouldDirty: true,
                        },
                      )
                      setValue('residualImpact', on ? impact : null, { shouldDirty: true })
                    }}
                  />
                  Rate the residual risk
                </label>
                {assessed ? (
                  <>
                    <Controller
                      control={control}
                      name="residualLikelihood"
                      render={({ field }) => (
                        <FormField id="risk-rl" label="Residual likelihood">
                          <ScoreInput
                            kind="likelihood"
                            id="risk-rl"
                            value={field.value ?? 1}
                            onChange={field.onChange}
                          />
                        </FormField>
                      )}
                    />
                    <Controller
                      control={control}
                      name="residualImpact"
                      render={({ field }) => (
                        <FormField
                          id="risk-ri"
                          label="Residual impact"
                          error={errors.residualImpact?.message}
                        >
                          <ScoreInput
                            kind="impact"
                            id="risk-ri"
                            value={field.value ?? 1}
                            onChange={field.onChange}
                          />
                        </FormField>
                      )}
                    />
                    <p className="flex items-center gap-2 text-sm">
                      Residual score{' '}
                      <ScoreBadge score={riskScore((resL ?? 1) as Score, (resI ?? 1) as Score)} />
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted">
                    The score after the treatment is in place. Leave it unrated until you can say.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ownership and review</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Controller
                control={control}
                name="owner"
                render={({ field }) => (
                  <FormField label="Owner" error={errors.owner?.message} required>
                    <PeoplePicker value={field.value} onChange={field.onChange} />
                  </FormField>
                )}
              />
              <Controller
                control={control}
                name="reviewAt"
                render={({ field }) => (
                  <FormField label="Next review" error={errors.reviewAt?.message} required>
                    <DateField mode="date" value={field.value} onChange={field.onChange} />
                  </FormField>
                )}
              />
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <FormField id="risk-status" label="Status" required>
                    <Select
                      value={field.value}
                      onValueChange={(v) => field.onChange(v as 'open' | 'closed')}
                    >
                      <SelectTrigger id="risk-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                )}
              />
              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                <Button type="submit" variant="primary" disabled={save.isPending}>
                  {save.isPending ? 'Saving…' : record ? 'Save changes' : 'Add risk'}
                </Button>
                <Button asChild variant="secondary">
                  <Link href={cancelHref}>Cancel</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      {record ? (
        <ConflictDialog
          open={conflict.open}
          onOpenChange={conflict.setOpen}
          theirs={conflict.theirs}
          mineText={describe(getValues())}
          pending={save.isPending}
          onOverwrite={() => {
            const latest = conflict.latest
            if (!latest) return
            setBaseVersion(latest.version)
            conflict.close()
            submit(getValues(), latest.version)
          }}
          onDiscard={() => {
            const latest = conflict.latest
            conflict.close()
            if (!latest) return
            setBaseVersion(latest.version)
            reset(valuesOf(latest))
            toast.message('Reloaded the saved version. Your changes were discarded.')
          }}
        />
      ) : null}
    </form>
  )
}
