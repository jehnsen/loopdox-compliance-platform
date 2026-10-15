'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Trash2Icon } from 'lucide-react'
import { isApiError } from '@/lib/api/client'
import {
  useAssessment,
  useCancelAssessment,
  useDecideAssessment,
  useUpdateAssessment,
} from '@/lib/api/hooks/use-ai'
import type {
  AiAnswer,
  AiAssessmentDecision,
  AiAssessmentSummary,
  AiRiskLevel,
} from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import {
  ANSWER_LABELS,
  ASSESSMENT_QUESTIONS,
  DECISION_LABELS,
  RISK_LABELS,
  suggestedRisk,
} from '@/lib/ai'
import { toastError } from '@/lib/utils/toast-error'
import { useOrgSlug } from '@/components/providers/session-provider'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DateText } from '@/components/date-text'
import { FormError, FormField } from '@/components/form/form-field'
import { MetadataStrip } from '@/components/metadata-strip'
import { PageHeader } from '@/components/page-header'
import { SeverityBadge, StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { aiCrumbs, aiPaths, recordFallback } from '@/features/ai-governance/shared'

interface Draft {
  answers: Record<string, { answer: AiAnswer | null; note: string }>
  humanOversight: boolean | null
  oversightNote: string
  decision: AiAssessmentDecision | null
  riskLevel: AiRiskLevel | null
  conditions: string
}

function draftOf(a: AiAssessmentSummary): Draft {
  return {
    answers: Object.fromEntries(a.questions.map((q) => [q.id, { answer: q.answer, note: q.note }])),
    humanOversight: a.humanOversight,
    oversightNote: a.oversightNote,
    decision: a.decision,
    riskLevel: a.riskLevel,
    conditions: a.conditions,
  }
}

const DECISIONS: { value: AiAssessmentDecision; hint: string }[] = [
  { value: 'approved', hint: 'The use case can go ahead as described.' },
  {
    value: 'approved_with_conditions',
    hint: 'It can go ahead, if the conditions you set are met.',
  },
  { value: 'rejected', hint: 'It can’t be used as described.' },
]

/** The answers of a decided assessment, read-only. */
function AnswersList({ a }: { a: AiAssessmentSummary }) {
  return (
    <ol className="flex flex-col divide-y divide-line">
      {a.questions.map((q, i) => (
        <li key={q.id} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
          <span className="text-base">
            {i + 1}. {q.q}
          </span>
          <span className="text-sm font-medium">
            {q.answer ? ANSWER_LABELS[q.answer] : 'Not answered'}
          </span>
          {q.note ? <span className="text-sm text-muted">{q.note}</span> : null}
        </li>
      ))}
    </ol>
  )
}

function AssessmentForm({ a }: { a: AiAssessmentSummary }) {
  const org = useOrgSlug()
  const router = useRouter()
  const update = useUpdateAssessment(org, a.id)
  const decide = useDecideAssessment(org, a.id)
  const cancel = useCancelAssessment(org, a.id)
  const [draft, setDraft] = useState<Draft>(() => draftOf(a))
  const [version, setVersion] = useState(a.version)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [confirmCancel, setConfirmCancel] = useState(false)

  const answered = ASSESSMENT_QUESTIONS.filter((q) => draft.answers[q.id]?.answer).length
  const suggestion = suggestedRisk(
    ASSESSMENT_QUESTIONS.map((q) => ({ id: q.id, answer: draft.answers[q.id]?.answer ?? null })),
  )
  const risk = draft.riskLevel ?? suggestion
  const saving = update.isPending || decide.isPending

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))
  const setAnswer = (id: string, change: Partial<{ answer: AiAnswer | null; note: string }>) =>
    setDraft((d) => ({
      ...d,
      answers: { ...d.answers, [id]: { answer: null, note: '', ...d.answers[id], ...change } },
    }))

  const answersBody = () =>
    ASSESSMENT_QUESTIONS.map((q) => ({
      id: q.id,
      answer: draft.answers[q.id]?.answer ?? null,
      note: draft.answers[q.id]?.note ?? '',
    }))

  const onError = (e: unknown) => {
    if (isApiError(e) && e.isConflict) {
      setError('Someone changed this assessment. Reload the page to see their answers.')
      return
    }
    if (isApiError(e) && e.fields) setFieldErrors(e.fields)
    setError(isApiError(e) ? e.message : 'Couldn’t save. Try again.')
  }

  const save = () => {
    setError(null)
    update.mutate(
      {
        ifVersion: version,
        questions: answersBody(),
        humanOversight: draft.humanOversight,
        oversightNote: draft.oversightNote,
      },
      {
        onSuccess: (r) => {
          setVersion(r.version)
          toast.success('Answers saved')
        },
        onError,
      },
    )
  }

  const record = () => {
    setError(null)
    setFieldErrors({})
    if (!draft.decision) {
      setFieldErrors({ decision: 'Choose a decision.' })
      return
    }
    if (draft.humanOversight === null) {
      setFieldErrors({ humanOversight: 'Say whether a person must check the outputs.' })
      return
    }
    // Save the answers first, then decide on the version that save returned.
    update.mutate(
      {
        ifVersion: version,
        questions: answersBody(),
        humanOversight: draft.humanOversight,
        oversightNote: draft.oversightNote,
      },
      {
        onSuccess: (saved) => {
          setVersion(saved.version)
          decide.mutate(
            {
              ifVersion: saved.version,
              decision: draft.decision ?? 'approved',
              riskLevel: risk,
              humanOversight: draft.humanOversight ?? false,
              oversightNote: draft.oversightNote,
              conditions: draft.conditions,
            },
            {
              onSuccess: (r) => {
                setVersion(r.version)
                toast.success(`${a.ref}: ${DECISION_LABELS[r.decision ?? 'approved']}`)
              },
              onError,
            },
          )
        },
        onError,
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <FormError message={error} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Questions</CardTitle>
          <div className="flex items-center gap-3 text-sm text-muted">
            <span data-testid="assessment-progress" className="tabular-nums">
              {answered} of {ASSESSMENT_QUESTIONS.length} answered
            </span>
            <Progress
              value={(answered / ASSESSMENT_QUESTIONS.length) * 100}
              className="w-32"
              aria-label="Questions answered"
            />
          </div>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-5">
            {ASSESSMENT_QUESTIONS.map((q, i) => {
              const a1 = draft.answers[q.id]
              return (
                <li key={q.id} className="flex flex-col gap-2" data-testid="assessment-question">
                  <fieldset className="flex flex-col gap-1.5">
                    <legend className="text-base font-medium">
                      {i + 1}. {q.q}
                    </legend>
                    <p className="text-sm text-muted">{q.hint}</p>
                    <div
                      className="flex flex-wrap gap-x-5 gap-y-1.5"
                      role="radiogroup"
                      aria-label={q.q}
                    >
                      {(['yes', 'no', 'unsure'] as const).map((value) => (
                        <label key={value} className="flex items-center gap-2 text-base">
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            value={value}
                            checked={a1?.answer === value}
                            onChange={() => setAnswer(q.id, { answer: value })}
                          />
                          {ANSWER_LABELS[value]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <Textarea
                    value={a1?.note ?? ''}
                    onChange={(e) => setAnswer(q.id, { note: e.target.value })}
                    rows={1}
                    placeholder="Add a note (optional)"
                    aria-label={`Note for question ${i + 1}`}
                  />
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Decision</CardTitle>
        </CardHeader>
        <CardContent className="flex max-w-2xl flex-col gap-5">
          <p className="rounded-md bg-surface-2 px-3 py-2 text-base" data-testid="suggested-risk">
            The answers so far point to{' '}
            <span className="font-semibold">{RISK_LABELS[suggestion].toLowerCase()} risk</span>. You
            can set a different rating, and say why in the note below.
          </p>
          <FormField id="assess-risk" label="Risk level" required>
            <Select value={risk} onValueChange={(v) => patch({ riskLevel: v as AiRiskLevel })}>
              <SelectTrigger id="assess-risk">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RISK_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium">
              Must a person check the outputs before they are used?
            </legend>
            <div className="flex gap-5">
              {([true, false] as const).map((v) => (
                <label key={String(v)} className="flex items-center gap-2 text-base">
                  <input
                    type="radio"
                    name="oversight"
                    checked={draft.humanOversight === v}
                    onChange={() => patch({ humanOversight: v })}
                  />
                  {v ? 'Yes, human oversight is required' : 'No'}
                </label>
              ))}
            </div>
            {fieldErrors.humanOversight ? (
              <p role="alert" className="text-sm text-bad">
                {fieldErrors.humanOversight}
              </p>
            ) : null}
          </fieldset>
          <FormField
            label="Note on oversight and the rating"
            hint="Who checks, how, or why the rating differs from the answers."
          >
            <Textarea
              value={draft.oversightNote}
              onChange={(e) => patch({ oversightNote: e.target.value })}
              rows={2}
            />
          </FormField>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Decision</legend>
            {DECISIONS.map((d) => (
              <label key={d.value} className="flex items-start gap-2 text-base">
                <input
                  type="radio"
                  name="decision"
                  className="mt-1"
                  checked={draft.decision === d.value}
                  onChange={() => patch({ decision: d.value })}
                />
                <span className="flex flex-col">
                  <span className="font-medium">{DECISION_LABELS[d.value]}</span>
                  <span className="text-sm text-muted">{d.hint}</span>
                </span>
              </label>
            ))}
            {fieldErrors.decision ? (
              <p role="alert" className="text-sm text-bad">
                {fieldErrors.decision}
              </p>
            ) : null}
          </fieldset>
          {draft.decision === 'approved_with_conditions' ? (
            <FormField
              label="Conditions"
              hint="What must stay true for this approval to hold. The use case shows these."
              error={fieldErrors.conditions}
              required
            >
              <Textarea
                value={draft.conditions}
                onChange={(e) => patch({ conditions: e.target.value })}
                rows={3}
              />
            </FormField>
          ) : null}
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button variant="primary" onClick={record} disabled={saving}>
              {decide.isPending ? 'Recording…' : 'Record decision'}
            </Button>
            <Button variant="secondary" onClick={save} disabled={saving}>
              {update.isPending && !decide.isPending ? 'Saving…' : 'Save answers'}
            </Button>
            <Button variant="ghost" className="ml-auto" onClick={() => setConfirmCancel(true)}>
              <Trash2Icon aria-hidden="true" /> Cancel assessment
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={`Cancel ${a.ref}?`}
        description="The answers so far are discarded. The use case stays as it is, and you can start another assessment."
        confirmLabel="Cancel assessment"
        destructive
        pending={cancel.isPending}
        onConfirm={() =>
          cancel.mutate(undefined, {
            onSuccess: () => {
              toast.success(`Cancelled ${a.ref}`)
              router.push(aiPaths.useCase(org, a.useCaseId))
            },
            onError: (e) => {
              setConfirmCancel(false)
              toastError(e)
            },
          })
        }
      />
    </div>
  )
}

export function AssessmentPage({ id }: { id: string }) {
  const org = useOrgSlug()
  const can = useCan()
  const query = useAssessment(org, id)
  const fallback = recordFallback(query, aiPaths.assessments(org))
  if (fallback || !query.data) return fallback
  const a = query.data
  const decided = a.status === 'decided'
  const editable = !decided && can('ai.edit')

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`Assessment of ${a.useCaseName}`}
        id={a.ref}
        status={<StatusPill status={a.status} />}
        breadcrumbs={aiCrumbs(
          { label: 'Assessments', href: aiPaths.assessments(org) },
          { label: a.ref },
        )}
        description={
          <Link href={aiPaths.useCase(org, a.useCaseId)} className="text-accent hover:underline">
            {a.useCaseRef} {a.useCaseName}
          </Link>
        }
        className="pb-0"
      />
      {decided ? (
        <>
          <MetadataStrip
            items={[
              {
                label: 'Decision',
                value: a.decision ? (
                  <StatusPill status={a.decision} label={DECISION_LABELS[a.decision]} />
                ) : null,
              },
              {
                label: 'Risk',
                value: a.riskLevel ? <SeverityBadge severity={a.riskLevel} /> : null,
              },
              {
                label: 'Human oversight',
                value: a.humanOversight ? 'Required' : 'Not required',
              },
              { label: 'Decided by', value: a.decidedByName },
              { label: 'Decided', value: <DateText value={a.decidedAt} withTime /> },
              { label: 'Answers pointed to', value: RISK_LABELS[a.suggestedRisk] },
            ]}
          />
          {a.conditions ? (
            <div
              className="rounded-md border border-warn/40 bg-warn-soft px-4 py-3 text-base"
              data-testid="assessment-conditions"
            >
              <p className="font-medium">Conditions</p>
              <p className="whitespace-pre-line">{a.conditions}</p>
            </div>
          ) : null}
          {a.oversightNote ? (
            <p className="rounded-md bg-surface-2 px-4 py-3 text-base">{a.oversightNote}</p>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Answers</CardTitle>
            </CardHeader>
            <CardContent>
              <AnswersList a={a} />
            </CardContent>
          </Card>
        </>
      ) : editable ? (
        <AssessmentForm key={a.id} a={a} />
      ) : (
        <>
          <p className="rounded-md bg-surface-2 px-4 py-3 text-base">
            This assessment is in progress. {a.answered} of {a.total} questions are answered. Only
            people who manage AI governance can answer and decide.
          </p>
          <Card>
            <CardContent>
              <AnswersList a={a} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
