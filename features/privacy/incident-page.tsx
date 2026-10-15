'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { FilePenLineIcon, FlameIcon, InfoIcon, LightbulbIcon, Link2Icon } from 'lucide-react'
import {
  useAddLink,
  useCreateRisk,
  useIncident,
  useProcessingActivities,
  useRecordRefs,
  useUpdateIncident,
} from '@/lib/api/hooks/use-privacy'
import { isApiError } from '@/lib/api/client'
import type { IncidentStatus, IncidentSummary, Severity } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { hasFeature } from '@/lib/entitlements'
import {
  createRiskSchema,
  triageSchema,
  type CreateRiskValues,
  type TriageValues,
} from '@/lib/schemas/privacy'
import { cn } from '@/lib/utils/cn'
import { formatDateTimeZone } from '@/lib/utils/dates'
import { toastError } from '@/lib/utils/toast-error'
import { useSession } from '@/components/providers/session-provider'
import { ActivityFeed } from '@/components/activity-feed'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { CountdownClock } from '@/components/countdown-clock'
import { DateText } from '@/components/date-text'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { PeoplePicker } from '@/components/form/people-picker'
import { RecordSearchList } from '@/components/form/record-picker'
import { ScoreInput } from '@/components/form/score-input'
import { LinkedRecords } from '@/components/linked-records'
import { MetadataStrip } from '@/components/metadata-strip'
import { PageHeader } from '@/components/page-header'
import { SeverityBadge, StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { IncidentNotices } from '@/features/privacy/incident-notices'
import { privacyPaths } from '@/features/privacy/paths'
import { detailFallback, Field, privacyCrumbs } from '@/features/privacy/shared'
import { policyPaths } from '@/features/policies/paths'

const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical']
const NONE = '__none'

function conflictOr(e: unknown, reload: () => void, fallback?: () => void) {
  if (isApiError(e) && e.isConflict) {
    toast.error(
      'Someone changed this incident. The latest version is loaded; make your change again.',
    )
    reload()
    return
  }
  if (fallback) fallback()
  else toastError(e)
}

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

/** Systems used by the linked processing records (and vice versa) that aren't linked yet. */
function Suggestions({ incident }: { incident: IncidentSummary }) {
  const { org } = useSession()
  const activities = useProcessingActivities(org.slug, { pageSize: 200 })
  const add = useAddLink(org.slug)
  const all = activities.data?.items ?? []
  const linkedPas = all.filter((p) => incident.processingActivityIds.includes(p.id))
  const systemIds = [...new Set(linkedPas.flatMap((p) => p.systemIds))].filter(
    (s) => !incident.systemIds.includes(s),
  )
  const paSuggestions = all.filter(
    (p) =>
      !incident.processingActivityIds.includes(p.id) &&
      p.systemIds.some((s) => incident.systemIds.includes(s)),
  )
  const systems = useRecordRefs(org.slug, 'system', systemIds)
  const items = [
    ...(systems.data ?? []).map((s) => ({
      type: 'system' as const,
      id: s.id,
      label: s.title,
      reason: `used by ${linkedPas
        .filter((p) => p.systemIds.includes(s.id))
        .map((p) => p.ref)
        .join(', ')}`,
    })),
    ...paSuggestions.map((p) => ({
      type: 'processing_activity' as const,
      id: p.id,
      label: `${p.ref} ${p.name}`,
      reason: 'uses a linked system',
    })),
  ]
  if (!items.length) return null
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-accent/30 bg-accent-soft px-3 py-2"
      data-testid="link-suggestions"
    >
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <LightbulbIcon className="size-4 text-accent" aria-hidden="true" /> Suggested from links
      </p>
      <ul className="flex flex-col gap-1">
        {items.map((s) => (
          <li key={`${s.type}-${s.id}`} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{s.label}</span>
            <span className="text-muted">({s.reason})</span>
            <Button
              variant="secondary"
              size="sm"
              className="ml-auto"
              disabled={add.isPending}
              onClick={() =>
                add.mutate(
                  { from: { type: 'incident', id: incident.id }, to: { type: s.type, id: s.id } },
                  {
                    onSuccess: () => toast.success(`Linked ${s.label}`),
                    onError: (e) => toastError(e),
                  },
                )
              }
            >
              <Link2Icon aria-hidden="true" /> Link
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TriagePanel({ incident, editable }: { incident: IncidentSummary; editable: boolean }) {
  const { org } = useSession()
  const update = useUpdateIncident(org.slug, incident.id)
  const reload = useIncident(org.slug, incident.id).refetch
  const [error, setError] = useState<string | null>(null)
  const form = useForm<TriageValues>({
    resolver: zodResolver(triageSchema),
    defaultValues: {
      severity: incident.severity,
      affectedCount: incident.affectedCount,
      personalDataInvolved: incident.personalDataInvolved,
      notificationRequired: incident.notificationRequired,
      notificationRationale: incident.notificationRationale ?? '',
    },
  })
  const { control, register, handleSubmit, setError: setFieldError, formState } = form
  const errors = formState.errors
  const personal = useWatch({ control, name: 'personalDataInvolved' })

  const submit = handleSubmit((v) => {
    setError(null)
    update.mutate(
      { ifVersion: incident.version, ...v, notificationRationale: v.notificationRationale || null },
      {
        onSuccess: () => toast.success('Triage saved'),
        onError: (e) =>
          conflictOr(
            e,
            () => void reload(),
            () => {
              if (isApiError(e) && applyFieldErrors(e.fields, setFieldError)) return
              setError(isApiError(e) ? e.message : 'Couldn’t save the triage. Try again.')
            },
          ),
      },
    )
  })

  if (!editable) {
    return (
      <Card id="triage">
        <CardHeader>
          <CardTitle className="text-base">Triage</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Severity">
              {incident.severity ? <SeverityBadge severity={incident.severity} /> : 'Not assessed'}
            </Field>
            <Field label="People affected">{incident.affectedCount ?? 'Not known yet'}</Field>
            <Field label="Notification required?">
              {incident.notificationRequired === null
                ? 'Not decided'
                : incident.notificationRequired
                  ? 'Yes'
                  : 'No'}
            </Field>
            <Field label="Why">
              {incident.notificationRationale ?? <span className="text-muted">—</span>}
            </Field>
          </dl>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card id="triage" className="scroll-mt-20">
      <CardHeader className="flex-col gap-1">
        <CardTitle className="text-base">Triage</CardTitle>
        <CardDescription>
          How serious it is, who’s affected, and whether the NPC and data subjects must be told.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <FormError message={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="severity"
              render={({ field }) => (
                <FormField id="triage-severity" label="Severity" error={errors.severity?.message}>
                  <Select
                    value={field.value ?? NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? null : (v as Severity))}
                  >
                    <SelectTrigger id="triage-severity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not assessed</SelectItem>
                      {SEVERITIES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            />
            <FormField
              label="People affected"
              hint="Approximate. Leave blank if not known yet."
              error={errors.affectedCount?.message}
            >
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                {...register('affectedCount', {
                  setValueAs: (v: unknown) => (v === '' || v === null ? null : Number(v)),
                })}
              />
            </FormField>
          </div>
          <Controller
            control={control}
            name="personalDataInvolved"
            render={({ field }) => (
              <div className="flex items-start justify-between gap-3">
                <div className="grid gap-0.5">
                  <label htmlFor="triage-personal" className="text-sm font-medium">
                    Personal data involved
                  </label>
                  <p className="text-sm text-muted" id="triage-personal-hint">
                    Turns the 72-hour clock on or off.
                  </p>
                </div>
                <Switch
                  id="triage-personal"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-describedby="triage-personal-hint"
                />
              </div>
            )}
          />
          {personal ? (
            <Controller
              control={control}
              name="notificationRequired"
              render={({ field }) => (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-medium">Notification required?</legend>
                  {(
                    [
                      [null, 'Not decided yet'],
                      [true, 'Yes: notify the NPC and data subjects'],
                      [false, 'No: notification isn’t required'],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={String(value)}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-2',
                        field.value === value && 'border-accent bg-accent-soft',
                      )}
                    >
                      <input
                        type="radio"
                        name={field.name}
                        checked={field.value === value}
                        onChange={() => field.onChange(value)}
                        className="accent-(--accent)"
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
              )}
            />
          ) : null}
          {personal ? (
            <FormField
              label="Why"
              hint="The reasoning, for the record: what data, how many people, the risk of serious harm."
              error={errors.notificationRationale?.message}
            >
              <Textarea {...register('notificationRationale')} rows={3} />
            </FormField>
          ) : null}
          <Suggestions incident={incident} />
          <Button type="submit" variant="primary" className="w-fit" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save triage'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Post-incident review
// ---------------------------------------------------------------------------

function CreateRiskDialog({
  incident,
  open,
  onOpenChange,
}: {
  incident: IncidentSummary
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { org, user } = useSession()
  const create = useCreateRisk(org.slug)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<CreateRiskValues>({
    resolver: zodResolver(createRiskSchema),
    defaultValues: {
      title: '',
      description: `Raised from the review of ${incident.ref}: ${incident.title}.`,
      likelihood: 3,
      impact: 3,
      owner: user.id,
      incidentId: incident.id,
    },
  })
  const { control, register, formState, handleSubmit } = form
  const submit = handleSubmit((v) =>
    create.mutate(v, {
      onSuccess: (risk) => {
        toast.success(`Created ${risk.ref} and linked it to ${incident.ref}`)
        form.reset()
        onOpenChange(false)
      },
      onError: (e) => setError(isApiError(e) ? e.message : 'Couldn’t create the risk.'),
    }),
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Create a risk</DialogTitle>
            <DialogDescription>
              Adds it to the risk register, linked to {incident.ref}.
            </DialogDescription>
          </DialogHeader>
          <FormError message={error} />
          <FormField label="Risk" error={formState.errors.title?.message} required>
            <Input {...register('title')} autoComplete="off" />
          </FormField>
          <FormField label="Description" error={formState.errors.description?.message}>
            <Textarea {...register('description')} rows={3} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="likelihood"
              render={({ field }) => (
                <FormField id="risk-l" label="Likelihood">
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
                <FormField id="risk-i" label="Impact">
                  <ScoreInput
                    kind="impact"
                    id="risk-i"
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormField>
              )}
            />
          </div>
          <Controller
            control={control}
            name="owner"
            render={({ field }) => (
              <FormField label="Owner" error={formState.errors.owner?.message} required>
                <PeoplePicker value={field.value} onChange={field.onChange} />
              </FormField>
            )}
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={create.isPending}>
              Create risk
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PolicyChangeDialog({
  incident,
  open,
  onOpenChange,
}: {
  incident: IncidentSummary
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { org } = useSession()
  const router = useRouter()
  const add = useAddLink(org.slug)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-3 p-0 pt-5">
        <DialogHeader className="px-5">
          <DialogTitle>Create a policy change</DialogTitle>
          <DialogDescription>
            Choose the policy to change. It’s linked to {incident.ref}, and the editor opens.
          </DialogDescription>
        </DialogHeader>
        <div className="border-t border-line">
          <RecordSearchList
            type="document"
            forRecord={{ type: 'incident', id: incident.id }}
            autoFocus
            onSelect={(doc) =>
              add.mutate(
                {
                  from: { type: 'incident', id: incident.id },
                  to: { type: 'document', id: doc.id },
                },
                {
                  onSuccess: () => {
                    toast.success(
                      `Linked ${doc.ref ?? doc.title}. Describe the change in the summary.`,
                    )
                    router.push(policyPaths.edit(org.slug, doc.id))
                  },
                  onError: (e) => toastError(e),
                },
              )
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PostIncidentReview({ incident }: { incident: IncidentSummary }) {
  const { org, tier } = useSession()
  const can = useCan()
  const update = useUpdateIncident(org.slug, incident.id)
  const reload = useIncident(org.slug, incident.id).refetch
  const [text, setText] = useState(incident.postIncidentReview ?? '')
  const [dialog, setDialog] = useState<'risk' | 'policy' | null>(null)
  const editable = can('privacy.edit')
  const canRisk = editable && hasFeature(tier, 'security') && can('security.edit')
  const canPolicy = editable && hasFeature(tier, 'policies') && can('policies.edit')
  return (
    <Card>
      <CardHeader className="flex-col gap-1">
        <CardTitle className="text-base">Post-incident review</CardTitle>
        <CardDescription>Root cause, what changes, and who owns each action.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {editable ? (
          <>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              aria-label="Post-incident review"
              placeholder="What caused it, and what will stop it happening again?"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={text === (incident.postIncidentReview ?? '') || update.isPending}
                onClick={() =>
                  update.mutate(
                    { ifVersion: incident.version, postIncidentReview: text || null },
                    {
                      onSuccess: () => toast.success('Review saved'),
                      onError: (e) => conflictOr(e, () => void reload()),
                    },
                  )
                }
              >
                Save review
              </Button>
              {canRisk ? (
                <Button variant="ghost" onClick={() => setDialog('risk')}>
                  <FlameIcon aria-hidden="true" /> Create risk
                </Button>
              ) : null}
              {canPolicy ? (
                <Button variant="ghost" onClick={() => setDialog('policy')}>
                  <FilePenLineIcon aria-hidden="true" /> Create policy change
                </Button>
              ) : null}
            </div>
          </>
        ) : incident.postIncidentReview ? (
          <p className="whitespace-pre-line">{incident.postIncidentReview}</p>
        ) : (
          <p className="text-muted">No review recorded yet.</p>
        )}
      </CardContent>
      {canRisk ? (
        <CreateRiskDialog
          incident={incident}
          open={dialog === 'risk'}
          onOpenChange={(o) => setDialog(o ? 'risk' : null)}
        />
      ) : null}
      {canPolicy ? (
        <PolicyChangeDialog
          incident={incident}
          open={dialog === 'policy'}
          onOpenChange={(o) => setDialog(o ? 'policy' : null)}
        />
      ) : null}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const STATUS_ACTIONS: {
  to: Exclude<IncidentStatus, 'notified' | 'reported'>
  label: string
  from: IncidentStatus[]
}[] = [
  { to: 'contained', label: 'Mark contained', from: ['reported', 'triage'] },
  { to: 'closed', label: 'Close incident', from: ['reported', 'triage', 'contained', 'notified'] },
]

export function IncidentPage({ id }: { id: string }) {
  const { org } = useSession()
  const can = useCan()
  const query = useIncident(org.slug, id)
  const update = useUpdateIncident(org.slug, id)
  const [confirm, setConfirm] = useState<(typeof STATUS_ACTIONS)[number] | null>(null)

  const fallback = detailFallback(query, privacyPaths.incidents(org.slug))
  if (fallback || !query.data) return fallback
  const incident = query.data
  const editable = can('privacy.edit') && incident.status !== 'closed'
  const tz = org.timezone

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={incident.title}
        id={incident.ref}
        status={
          <>
            <StatusPill status={incident.status} />
            {incident.severity ? <SeverityBadge severity={incident.severity} /> : null}
          </>
        }
        breadcrumbs={privacyCrumbs(
          { label: 'Incidents and breaches', href: privacyPaths.incidents(org.slug) },
          { label: incident.ref },
        )}
        className="pb-0"
        actions={
          editable
            ? STATUS_ACTIONS.filter((a) => a.from.includes(incident.status)).map((a) => (
                <Button
                  key={a.to}
                  variant={a.to === 'closed' ? 'secondary' : 'primary'}
                  onClick={() => setConfirm(a)}
                >
                  {a.label}
                </Button>
              ))
            : null
        }
      />

      {incident.personalDataInvolved && incident.notificationDeadline ? (
        <CountdownClock
          deadline={incident.notificationDeadline}
          discoveredAt={incident.discoveredAt}
          notifiedAt={incident.npcNotifiedAt}
          notificationRequired={incident.notificationRequired}
          timezone={tz}
          decideAction={
            editable ? (
              <Button asChild variant="secondary" size="sm">
                <a href="#triage">Go to triage</a>
              </Button>
            ) : null
          }
        />
      ) : (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-base"
        >
          <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
          No personal data is recorded as involved, so there’s no NPC notification clock. If that
          changes, update the triage: the clock runs from discovery.
        </p>
      )}

      <MetadataStrip
        items={[
          { label: 'Status', value: <StatusPill status={incident.status} /> },
          {
            label: 'Severity',
            value: incident.severity ? (
              <SeverityBadge severity={incident.severity} />
            ) : (
              'Not assessed'
            ),
          },
          { label: 'Discovered', value: <DateText value={incident.discoveredAt} withTime /> },
          { label: 'Reported by', value: incident.reportedByName },
          { label: 'People affected', value: incident.affectedCount ?? 'Not known yet' },
          {
            label: 'NPC notified',
            value: incident.npcNotifiedAt ? (
              <DateText value={incident.npcNotifiedAt} withTime />
            ) : (
              'No'
            ),
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">What happened</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-4">
                <Field label="Description">
                  <p className="max-w-reading whitespace-pre-line">{incident.description}</p>
                </Field>
                <Field label="What’s affected">
                  {incident.affectedSummary || <span className="text-muted">Not described</span>}
                </Field>
                <Field label="Discovered">{formatDateTimeZone(incident.discoveredAt, tz)}</Field>
                {incident.containedAt ? (
                  <Field label="Contained">{formatDateTimeZone(incident.containedAt, tz)}</Field>
                ) : null}
              </dl>
            </CardContent>
          </Card>
          <TriagePanel key={incident.version} incident={incident} editable={editable} />
          {incident.personalDataInvolved ? <IncidentNotices incident={incident} /> : null}
          <PostIncidentReview key={`review-${incident.version}`} incident={incident} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <LinkedRecords
            type="incident"
            id={incident.id}
            readOnly={!editable}
            only={['processing_activity', 'system', 'document', 'risk']}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed targetType="incident" targetId={incident.id} />
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? `${confirm.label}?` : ''}
        description={
          confirm?.to === 'closed'
            ? 'Closed incidents become read-only, apart from the post-incident review.'
            : 'Record that the incident is contained: the exposure has stopped.'
        }
        confirmLabel={confirm?.label ?? 'Confirm'}
        pending={update.isPending}
        onConfirm={() => {
          if (!confirm) return
          update.mutate(
            { ifVersion: incident.version, status: confirm.to },
            {
              onSuccess: () => {
                toast.success(
                  confirm.to === 'closed'
                    ? `${incident.ref} closed`
                    : `${incident.ref} marked contained`,
                )
                setConfirm(null)
              },
              onError: (e) => {
                setConfirm(null)
                conflictOr(e, () => void query.refetch())
              },
            },
          )
        }}
      />
    </div>
  )
}
