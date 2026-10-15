'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { Controller, useFieldArray, useForm, useWatch, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { z } from 'zod'
import { CheckIcon, InfoIcon, LockIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import {
  useCreatePia,
  usePia,
  useProcessingActivities,
  useSignOffPia,
  useUpdatePia,
} from '@/lib/api/hooks/use-privacy'
import { isApiError } from '@/lib/api/client'
import type { PiaStep, PiaSummary, Score, UpdatePiaRequest } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { DATA_FLOW_LABELS, DATA_FLOW_STAGES, PIA_DECISION_LABELS, PIA_STEPS } from '@/lib/privacy'
import { IMPACT_LABELS, LIKELIHOOD_LABELS, overallScore, riskScore } from '@/lib/risk'
import {
  piaDecisionSchema,
  piaRiskSchema,
  piaScopeSchema,
  type PiaScopeValues,
} from '@/lib/schemas/privacy'
import { cn } from '@/lib/utils/cn'
import { useOrgSlug, useSession } from '@/components/providers/session-provider'
import { ActivityFeed } from '@/components/activity-feed'
import { DateText } from '@/components/date-text'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { ScoreInput } from '@/components/form/score-input'
import { MetadataStrip } from '@/components/metadata-strip'
import { PageHeader } from '@/components/page-header'
import { RiskMatrix, ScoreBadge } from '@/components/risk-matrix'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { privacyPaths } from '@/features/privacy/paths'
import { detailFallback, Field, privacyCrumbs } from '@/features/privacy/shared'

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

function Stepper({
  current,
  furthest,
  onGo,
}: {
  current: PiaStep
  furthest: PiaStep
  onGo?: (s: PiaStep) => void
}) {
  return (
    <nav aria-label="Assessment steps">
      <ol className="grid grid-cols-5 gap-1 sm:gap-2">
        {PIA_STEPS.map((label, i) => {
          const step = (i + 1) as PiaStep
          const done = step < furthest && step !== current
          const reachable = Boolean(onGo) && step <= furthest
          const body = (
            <>
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums',
                  step === current
                    ? 'border-accent bg-accent text-accent-fg'
                    : done
                      ? 'border-ok bg-ok-soft text-ok'
                      : 'border-line text-muted',
                )}
              >
                {done ? <CheckIcon className="size-3.5" aria-hidden="true" /> : step}
              </span>
              <span
                className={cn(
                  'hidden truncate text-sm sm:inline',
                  step === current ? 'font-semibold' : 'text-muted',
                )}
              >
                {label}
              </span>
              <span className="sr-only sm:hidden">{label}</span>
              {done ? <span className="sr-only"> (saved)</span> : null}
            </>
          )
          return (
            <li key={label} className="min-w-0">
              {reachable ? (
                <button
                  type="button"
                  onClick={() => onGo?.(step)}
                  aria-current={step === current ? 'step' : undefined}
                  className="flex w-full items-center gap-2 rounded-md border-t-2 border-transparent pt-2 text-left hover:text-fg aria-[current=step]:border-accent"
                >
                  {body}
                </button>
              ) : (
                <span
                  aria-current={step === current ? 'step' : undefined}
                  className="flex items-center gap-2 border-t-2 border-transparent pt-2 aria-[current=step]:border-accent"
                >
                  {body}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function StepFooter({
  back,
  pending,
  submitLabel = 'Save and continue',
}: {
  back?: () => void
  pending: boolean
  submitLabel?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
      {back ? (
        <Button variant="secondary" onClick={back}>
          Back
        </Button>
      ) : null}
      <Button type="submit" variant="primary" disabled={pending} className="ml-auto">
        {pending ? 'Saving…' : submitLabel}
      </Button>
    </div>
  )
}

/** Shared write handling for wizard steps: 409 reloads, 400 maps onto fields. */
function useStepSave(pia: PiaSummary, onSaved: (p: PiaSummary) => void) {
  const org = useOrgSlug()
  const update = useUpdatePia(org, pia.id)
  const [error, setError] = useState<string | null>(null)
  /** `onFieldErrors` maps a 400's fields onto the form; returns true when it did. */
  const save = (
    body: Omit<UpdatePiaRequest, 'ifVersion'>,
    onFieldErrors?: (fields: Record<string, string> | undefined) => boolean,
  ) => {
    setError(null)
    update.mutate(
      { ...body, ifVersion: pia.version },
      {
        onSuccess: onSaved,
        onError: (e) => {
          if (isApiError(e) && e.isConflict) {
            setError(
              'Someone else saved this assessment while you were working. Their version is loaded; check it and save again.',
            )
            return
          }
          if (isApiError(e) && onFieldErrors?.(e.fields)) {
            setError('Some fields need attention.')
            return
          }
          setError(isApiError(e) ? e.message : 'Couldn’t save. Try again.')
        },
      },
    )
  }
  return { save, pending: update.isPending, error }
}

// ---------------------------------------------------------------------------
// Step 1: Scope (also the "new" page)
// ---------------------------------------------------------------------------

function ScopeFields({ form }: { form: UseFormReturn<PiaScopeValues> }) {
  const org = useOrgSlug()
  const activities = useProcessingActivities(org, { pageSize: 200, sort: 'ref' })
  const { control, register, formState } = form
  return (
    <>
      <Controller
        control={control}
        name="processingActivityId"
        render={({ field }) => (
          <FormField
            id="pia-activity"
            label="Processing activity"
            hint="The activity this assessment covers."
            error={formState.errors.processingActivityId?.message}
            required
          >
            <Select value={field.value || undefined} onValueChange={field.onChange}>
              <SelectTrigger id="pia-activity" aria-describedby="pia-activity-hint">
                <SelectValue
                  placeholder={activities.isLoading ? 'Loading…' : 'Choose a processing record'}
                />
              </SelectTrigger>
              <SelectContent>
                {(activities.data?.items ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.ref} · {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
      />
      <FormField
        label="Scope"
        hint="What this assessment covers: systems, teams, the stages of processing, and anything left out."
        error={formState.errors.scope?.message}
        required
      >
        <Textarea {...register('scope')} rows={5} />
      </FormField>
    </>
  )
}

export function NewPiaPage() {
  const org = useOrgSlug()
  const router = useRouter()
  const searchParams = useSearchParams()
  const create = useCreatePia(org)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<PiaScopeValues>({
    resolver: zodResolver(piaScopeSchema),
    defaultValues: { processingActivityId: searchParams.get('processing') ?? '', scope: '' },
  })
  const submit = form.handleSubmit((values) => {
    setError(null)
    create.mutate(values, {
      onSuccess: (pia) => {
        toast.success(`Started ${pia.ref}`)
        router.push(privacyPaths.piaView(org, pia.id, 2))
      },
      onError: (e) => {
        if (isApiError(e) && applyFieldErrors(e.fields, form.setError)) return
        setError(isApiError(e) ? e.message : 'Couldn’t start the assessment. Try again.')
      },
    })
  })
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="New impact assessment"
        breadcrumbs={privacyCrumbs(
          { label: 'Impact assessments', href: privacyPaths.pias(org) },
          { label: 'New' },
        )}
        description="Five steps. Progress is saved at each step, so you can come back to it."
        className="pb-0"
      />
      <Stepper current={1} furthest={1} />
      <form onSubmit={submit} noValidate>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Scope</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormError message={error} />
            <ScopeFields form={form} />
            <StepFooter pending={create.isPending} submitLabel="Start assessment" />
          </CardContent>
        </Card>
      </form>
    </div>
  )
}

function ScopeStep({ pia, next }: { pia: PiaSummary; next: (p: PiaSummary) => void }) {
  const form = useForm<PiaScopeValues>({
    resolver: zodResolver(piaScopeSchema),
    defaultValues: { processingActivityId: pia.processingActivityId, scope: pia.scope },
  })
  const { save, pending, error } = useStepSave(pia, next)
  return (
    <form
      onSubmit={form.handleSubmit((v) =>
        save({ ...v, currentStep: 2 }, (fields) => applyFieldErrors(fields, form.setError)),
      )}
      noValidate
    >
      <StepCard title="1. Scope" error={error}>
        <ScopeFields form={form} />
        <StepFooter pending={pending} />
      </StepCard>
    </form>
  )
}

function StepCard({
  title,
  description,
  error,
  children,
}: {
  title: string
  description?: ReactNode
  error: string | null
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex-col gap-1">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FormError message={error} />
        {children}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Step 2: Data flows
// ---------------------------------------------------------------------------

const flowsSchema = z.object({
  collection: z.string().max(4000),
  use: z.string().max(4000),
  storage: z.string().max(4000),
  sharing: z.string().max(4000),
  disposal: z.string().max(4000),
})

function FlowsStep({
  pia,
  next,
  back,
}: {
  pia: PiaSummary
  next: (p: PiaSummary) => void
  back: () => void
}) {
  const form = useForm<z.infer<typeof flowsSchema>>({
    resolver: zodResolver(flowsSchema),
    defaultValues: pia.dataFlows,
  })
  const { save, pending, error } = useStepSave(pia, next)
  return (
    <form onSubmit={form.handleSubmit((v) => save({ dataFlows: v, currentStep: 3 }))} noValidate>
      <StepCard
        title="2. Data flows"
        description="Follow the data through its life. Leave a stage blank if it doesn’t apply."
        error={error}
      >
        {DATA_FLOW_STAGES.map((stage) => (
          <FormField
            key={stage}
            label={DATA_FLOW_LABELS[stage].label}
            hint={DATA_FLOW_LABELS[stage].hint}
          >
            <Textarea {...form.register(stage)} rows={3} />
          </FormField>
        ))}
        <StepFooter back={back} pending={pending} />
      </StepCard>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Steps 3 and 4: Risks, then mitigations
// ---------------------------------------------------------------------------

const risksFormSchema = z.object({
  risks: z.array(piaRiskSchema).min(1, 'Add at least one risk.'),
})
const mitigationsFormSchema = z.object({
  risks: z.array(
    piaRiskSchema.extend({
      mitigation: z.string().trim().min(3, 'Describe how this risk is reduced.').max(2000),
    }),
  ),
})
type RisksValues = z.infer<typeof risksFormSchema>

function newRiskId(): string {
  return `risk_${crypto.randomUUID().slice(0, 8)}`
}

function RisksStep({
  pia,
  next,
  back,
}: {
  pia: PiaSummary
  next: (p: PiaSummary) => void
  back: () => void
}) {
  const form = useForm<RisksValues>({
    resolver: zodResolver(risksFormSchema),
    defaultValues: {
      risks: pia.risks.length
        ? pia.risks
        : [{ id: newRiskId(), description: '', likelihood: 3, impact: 3, mitigation: '' }],
    },
  })
  const { control, register, formState } = form
  const rows = useFieldArray({ control, name: 'risks', keyName: 'key' })
  const live = useWatch({ control, name: 'risks' })
  const { save, pending, error } = useStepSave(pia, next)
  const overall = overallScore(live)
  return (
    <form onSubmit={form.handleSubmit((v) => save({ risks: v.risks, currentStep: 4 }))} noValidate>
      <StepCard
        title="3. Risks"
        description="What could go wrong for the people whose data this is? Rate how likely it is and how much harm it would do."
        error={error}
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto]">
          <ol className="flex flex-col gap-3">
            {rows.fields.map((row, i) => {
              const r = live[i]
              const score = r ? riskScore(r.likelihood, r.impact) : null
              return (
                <li
                  key={row.key}
                  className="flex flex-col gap-3 rounded-md border border-line p-3"
                  data-testid="risk-row"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-1.5 text-sm font-semibold text-muted tabular-nums">
                      {i + 1}.
                    </span>
                    <div className="flex-1">
                      <Textarea
                        {...register(`risks.${i}.description`)}
                        rows={2}
                        aria-label={`Risk ${i + 1}`}
                        aria-invalid={formState.errors.risks?.[i]?.description ? true : undefined}
                        placeholder="For example: Applicant CVs are shared in chat"
                      />
                      {formState.errors.risks?.[i]?.description ? (
                        <p className="mt-1 text-sm text-bad">
                          {formState.errors.risks[i]?.description?.message}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => rows.remove(i)}
                      aria-label={`Remove risk ${i + 1}`}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <Controller
                      control={control}
                      name={`risks.${i}.likelihood`}
                      render={({ field }) => (
                        <FormField id={`risk-${i}-l`} label="Likelihood">
                          <ScoreInput
                            kind="likelihood"
                            id={`risk-${i}-l`}
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormField>
                      )}
                    />
                    <Controller
                      control={control}
                      name={`risks.${i}.impact`}
                      render={({ field }) => (
                        <FormField id={`risk-${i}-i`} label="Impact">
                          <ScoreInput
                            kind="impact"
                            id={`risk-${i}-i`}
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormField>
                      )}
                    />
                    <div className="flex h-8 items-center gap-2 text-sm" aria-live="polite">
                      <span className="text-muted">Score</span>
                      <ScoreBadge score={score} />
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
          <div className="flex flex-col gap-3">
            <RiskMatrix
              risks={live.filter((r): r is NonNullable<typeof r> => Boolean(r))}
              caption="Live risk matrix"
            />
            <p className="text-sm" aria-live="polite">
              Overall score (the highest risk): <ScoreBadge score={overall} />
            </p>
          </div>
        </div>
        {formState.errors.risks?.message ? (
          <p className="text-sm text-bad">{formState.errors.risks.message}</p>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          className="w-fit"
          onClick={() =>
            rows.append({
              id: newRiskId(),
              description: '',
              likelihood: 3,
              impact: 3,
              mitigation: '',
            })
          }
        >
          <PlusIcon aria-hidden="true" /> Add risk
        </Button>
        <StepFooter back={back} pending={pending} />
      </StepCard>
    </form>
  )
}

function MitigationsStep({
  pia,
  next,
  back,
}: {
  pia: PiaSummary
  next: (p: PiaSummary) => void
  back: () => void
}) {
  const form = useForm<z.infer<typeof mitigationsFormSchema>>({
    resolver: zodResolver(mitigationsFormSchema),
    defaultValues: { risks: pia.risks },
  })
  const { save, pending, error } = useStepSave(pia, next)
  if (!pia.risks.length) {
    return (
      <StepCard title="4. Mitigations" error={null}>
        <p>Add the risks first.</p>
        <StepFooter back={back} pending={false} submitLabel="Back to risks" />
      </StepCard>
    )
  }
  return (
    <form onSubmit={form.handleSubmit((v) => save({ risks: v.risks, currentStep: 5 }))} noValidate>
      <StepCard
        title="4. Mitigations"
        description="For each risk, say what reduces it: a control, a process change, a contract term."
        error={error}
      >
        <ol className="flex flex-col gap-4">
          {pia.risks.map((r, i) => (
            <li key={r.id} className="flex flex-col gap-2 rounded-md border border-line p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium">
                  {i + 1}. {r.description}
                </p>
                <ScoreBadge score={riskScore(r.likelihood, r.impact)} />
              </div>
              <FormField
                label={`Mitigation for risk ${i + 1}`}
                error={form.formState.errors.risks?.[i]?.mitigation?.message}
                required
              >
                <Textarea {...form.register(`risks.${i}.mitigation`)} rows={2} />
              </FormField>
            </li>
          ))}
        </ol>
        <StepFooter back={back} pending={pending} />
      </StepCard>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Step 5: Decision and sign-off
// ---------------------------------------------------------------------------

const decisionFormSchema = z
  .object({ decision: piaDecisionSchema, conditions: z.string().trim().max(2000) })
  .refine((v) => v.decision !== 'proceed_with_conditions' || v.conditions.length >= 3, {
    path: ['conditions'],
    message: 'List the conditions that must be met.',
  })

function DecisionStep({ pia, back }: { pia: PiaSummary; back: () => void }) {
  const org = useOrgSlug()
  const { user } = useSession()
  const signOff = useSignOffPia(org, pia.id)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<z.infer<typeof decisionFormSchema>>({
    resolver: zodResolver(decisionFormSchema),
    defaultValues: { decision: 'proceed', conditions: '' },
  })
  const decision = useWatch({ control: form.control, name: 'decision' })
  const missing = pia.risks.filter((r) => r.mitigation.trim().length < 3).length
  const submit = form.handleSubmit((v) => {
    setError(null)
    signOff.mutate(
      {
        ifVersion: pia.version,
        decision: v.decision,
        conditions: v.decision === 'proceed_with_conditions' ? v.conditions : null,
      },
      {
        onSuccess: (p) => toast.success(`${p.ref} signed off`),
        onError: (e) => setError(isApiError(e) ? e.message : 'Couldn’t sign off. Try again.'),
      },
    )
  })
  return (
    <form onSubmit={submit} noValidate>
      <StepCard title="5. Decision and sign-off" error={error}>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Field label="Risks">{pia.risks.length}</Field>
          <Field label="Overall score">
            <ScoreBadge score={pia.overallScore} />
          </Field>
          <Field label="Mitigations">
            {missing ? (
              <span className="text-bad">{missing} still needed (step 4)</span>
            ) : (
              'All risks covered'
            )}
          </Field>
        </dl>
        <Controller
          control={form.control}
          name="decision"
          render={({ field }) => (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Decision</legend>
              {(Object.keys(PIA_DECISION_LABELS) as (keyof typeof PIA_DECISION_LABELS)[]).map(
                (d) => (
                  <label
                    key={d}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-2',
                      field.value === d && 'border-accent bg-accent-soft',
                    )}
                  >
                    <input
                      type="radio"
                      name={field.name}
                      value={d}
                      checked={field.value === d}
                      onChange={() => field.onChange(d)}
                      className="accent-(--accent)"
                    />
                    {PIA_DECISION_LABELS[d]}
                  </label>
                ),
              )}
            </fieldset>
          )}
        />
        {decision === 'proceed_with_conditions' ? (
          <FormField label="Conditions" error={form.formState.errors.conditions?.message} required>
            <Textarea {...form.register('conditions')} rows={3} />
          </FormField>
        ) : null}
        <p className="flex items-start gap-2 text-sm text-muted">
          <LockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Signing off records you, {user.name}, as the signatory and locks the assessment.
        </p>
        <StepFooter back={back} pending={signOff.isPending} submitLabel="Sign off assessment" />
      </StepCard>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Summary (after sign-off, and for read-only viewers)
// ---------------------------------------------------------------------------

function PiaSummaryView({ pia }: { pia: PiaSummary }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <Card>
          <CardContent>
            <dl className="flex flex-col gap-5">
              <Field label="Scope">
                <p className="max-w-reading whitespace-pre-line">{pia.scope}</p>
              </Field>
              {DATA_FLOW_STAGES.map((s) => (
                <Field key={s} label={DATA_FLOW_LABELS[s].label}>
                  {pia.dataFlows[s] ? (
                    <p className="max-w-reading whitespace-pre-line">{pia.dataFlows[s]}</p>
                  ) : (
                    <span className="text-muted">Not described</span>
                  )}
                </Field>
              ))}
              {pia.conditions ? (
                <Field label="Conditions">
                  <p className="max-w-reading whitespace-pre-line">{pia.conditions}</p>
                </Field>
              ) : null}
            </dl>
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardContent>
            <RiskMatrix risks={pia.risks} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Risks and mitigations</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {pia.risks.length ? (
            <table className="w-full min-w-[640px] text-base" aria-label="Risks and mitigations">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Risk
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Likelihood
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Impact
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Score
                  </th>
                  <th scope="col" className="py-2 font-semibold">
                    Mitigation
                  </th>
                </tr>
              </thead>
              <tbody>
                {pia.risks.map((r) => (
                  <tr key={r.id} className="border-b border-line align-top last:border-b-0">
                    <td className="py-2 pr-3">{r.description}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {r.likelihood} · {LIKELIHOOD_LABELS[r.likelihood as Score]}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {r.impact} · {IMPACT_LABELS[r.impact as Score]}
                    </td>
                    <td className="py-2 pr-3">
                      <ScoreBadge score={riskScore(r.likelihood, r.impact)} />
                    </td>
                    <td className="py-2">
                      {r.mitigation || <span className="text-muted">Not yet</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-muted">No risks recorded yet.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityFeed targetType="pia" targetId={pia.id} />
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function PiaPage({ id }: { id: string }) {
  const org = useOrgSlug()
  const can = useCan()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = usePia(org, id)

  const fallback = detailFallback(query, privacyPaths.pias(org))
  if (fallback || !query.data) return fallback
  const pia = query.data
  const signed = pia.status === 'signed_off'
  const editing = !signed && can('privacy.edit')
  const requested = Number(searchParams.get('step'))
  const step = (
    requested >= 1 && requested <= pia.currentStep ? requested : pia.currentStep
  ) as PiaStep
  const go = (s: PiaStep) => router.replace(`${pathname}?step=${s}`, { scroll: false })
  // The stepper marks saved steps; no toast, so nothing stacks over the next step's buttons.
  const next = () => go(Math.min(5, step + 1) as PiaStep)
  const back = () => go(Math.max(1, step - 1) as PiaStep)

  const title = pia.processingActivityName
    ? `Impact assessment: ${pia.processingActivityName}`
    : 'Impact assessment'

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={title}
        id={pia.ref}
        status={
          signed ? (
            <StatusPill status="signed_off" />
          ) : (
            <StatusPill status="in_progress" label={`In progress: step ${pia.currentStep} of 5`} />
          )
        }
        breadcrumbs={privacyCrumbs(
          { label: 'Impact assessments', href: privacyPaths.pias(org) },
          { label: pia.ref },
        )}
        className="pb-0"
      />
      <MetadataStrip
        items={[
          {
            label: 'Processing record',
            value: (
              <Link
                href={privacyPaths.processingView(org, pia.processingActivityId)}
                className="hover:underline"
              >
                {pia.processingActivityRef ?? 'Open'}
              </Link>
            ),
          },
          { label: 'Overall score', value: <ScoreBadge score={pia.overallScore} /> },
          { label: 'Risks', value: pia.risks.length },
          { label: 'Decision', value: pia.decision ? PIA_DECISION_LABELS[pia.decision] : null },
          { label: 'Signed off by', value: pia.signedOffByName },
          {
            label: 'Signed off',
            value: pia.signedOffAt ? <DateText value={pia.signedOffAt} /> : null,
          },
        ]}
      />
      {editing ? (
        <>
          <Stepper current={step} furthest={pia.currentStep} onGo={go} />
          <p className="sr-only" aria-live="polite">
            {step > 1 ? `Saved. Step ${step} of 5: ${PIA_STEPS[step - 1]}.` : ''}
          </p>
          <div key={`${step}-${pia.version}`}>
            {step === 1 ? (
              <ScopeStep pia={pia} next={next} />
            ) : step === 2 ? (
              <FlowsStep pia={pia} next={next} back={back} />
            ) : step === 3 ? (
              <RisksStep pia={pia} next={next} back={back} />
            ) : step === 4 ? (
              <MitigationsStep pia={pia} next={next} back={back} />
            ) : (
              <DecisionStep pia={pia} back={back} />
            )}
          </div>
        </>
      ) : (
        <>
          {!signed ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3"
            >
              <InfoIcon className="size-5 text-warn" aria-hidden="true" />
              This assessment is in progress (step {pia.currentStep} of 5:{' '}
              {PIA_STEPS[pia.currentStep - 1]}). It hasn’t been signed off.
            </p>
          ) : null}
          <PiaSummaryView pia={pia} />
        </>
      )}
    </div>
  )
}
