'use client'

import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2Icon, ClipboardCheckIcon } from 'lucide-react'
import {
  useAccessReview,
  useDecide,
  useKeepAll,
  useSignOffReview,
} from '@/lib/api/hooks/use-security'
import { isApiError } from '@/lib/api/client'
import type {
  AccessLevel,
  AccessReviewItem,
  AccessReviewSummary,
  ReviewDecision,
} from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { ACCESS_LEVEL_LABELS, ACCESS_LEVELS, REVIEW_DECISION_LABELS } from '@/lib/security'
import { cn } from '@/lib/utils/cn'
import { plural } from '@/lib/utils/format'
import { toastError } from '@/lib/utils/toast-error'
import { useOrgSlug } from '@/components/providers/session-provider'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { CalendarDate, DateText } from '@/components/date-text'
import { MetadataStrip } from '@/components/metadata-strip'
import { PageHeader } from '@/components/page-header'
import { StatusPill } from '@/components/status-pill'
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
import { ActivityFeed } from '@/components/activity-feed'
import { securityPaths } from '@/features/security/paths'
import {
  AccessLevelBadge,
  DuePill,
  recordFallback,
  securityCrumbs,
} from '@/features/security/shared'

const DECISIONS: ReviewDecision[] = ['keep', 'revoke', 'change']

/** One grant under review: Keep decides at once; Revoke and Change ask for a reason or a level first. */
function ItemRow({
  item,
  reviewId,
  readOnly,
}: {
  item: AccessReviewItem
  reviewId: string
  readOnly: boolean
}) {
  const org = useOrgSlug()
  const decide = useDecide(org, reviewId)
  const [editing, setEditing] = useState<'revoke' | 'change' | null>(null)
  const [note, setNote] = useState(item.note)
  const [newLevel, setNewLevel] = useState<AccessLevel | null>(item.newLevel)
  const [error, setError] = useState<string | null>(null)
  const name = `${item.personName} on ${item.systemName}`

  const send = (
    decision: ReviewDecision | null,
    extra: { note?: string; newLevel?: AccessLevel | null } = {},
  ) =>
    decide.mutate(
      { grantId: item.grantId, decision, ...extra },
      {
        onSuccess: () => {
          setEditing(null)
          setError(null)
        },
        onError: (e) => {
          if (isApiError(e) && e.fields) {
            setError(Object.values(e.fields)[0] ?? e.message)
          } else toastError(e)
        },
      },
    )

  const choose = (d: ReviewDecision) => {
    setError(null)
    if (d === 'keep') {
      setEditing(null)
      send('keep')
    } else {
      setEditing(d)
      setNote(item.decision === d ? item.note : '')
      setNewLevel(item.decision === d ? item.newLevel : null)
    }
  }

  const shown = editing ?? item.decision
  return (
    <li
      className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0"
      data-testid="review-item"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-48 flex-1 flex-wrap items-center gap-2">
          <span className="font-medium">{item.personName}</span>
          <AccessLevelBadge level={item.level} />
        </div>
        {readOnly ? (
          <span
            className="text-sm font-medium"
            data-testid="review-decision"
            data-decision={item.decision ?? 'none'}
          >
            {item.decision ? REVIEW_DECISION_LABELS[item.decision] : 'No decision'}
            {item.decision === 'change' && item.newLevel
              ? ` to ${ACCESS_LEVEL_LABELS[item.newLevel].toLowerCase()}`
              : ''}
          </span>
        ) : (
          <div
            role="radiogroup"
            aria-label={`Decision for ${name}`}
            className="flex rounded-md border border-line p-0.5"
          >
            {DECISIONS.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={shown === d}
                disabled={decide.isPending && decide.variables?.grantId === item.grantId}
                onClick={() => choose(d)}
                className={cn(
                  'h-7 min-w-16 rounded-sm px-3 text-sm',
                  shown === d
                    ? d === 'revoke'
                      ? 'bg-bad-soft font-medium text-bad'
                      : d === 'change'
                        ? 'bg-warn-soft font-medium text-warn'
                        : 'bg-ok-soft font-medium text-ok'
                    : 'text-muted hover:text-fg',
                )}
              >
                {REVIEW_DECISION_LABELS[d]}
              </button>
            ))}
          </div>
        )}
        {!readOnly && item.decision && !editing ? (
          <Button
            variant="link"
            size="sm"
            onClick={() => send(null)}
            aria-label={`Clear the decision for ${name}`}
          >
            Clear
          </Button>
        ) : null}
      </div>
      {readOnly && item.note ? <p className="text-sm text-muted">“{item.note}”</p> : null}
      {!readOnly && item.decision && !editing && item.note ? (
        <p className="text-sm text-muted">
          {item.decision === 'change' && item.newLevel
            ? `Change to ${ACCESS_LEVEL_LABELS[item.newLevel].toLowerCase()}. `
            : ''}
          “{item.note}”
        </p>
      ) : null}
      {!readOnly && editing ? (
        <div className="grid gap-2 rounded-md bg-surface-2 p-3">
          {editing === 'change' ? (
            <div className="grid gap-1">
              <label htmlFor={`lvl-${item.grantId}`} className="text-sm font-medium">
                New level
              </label>
              <Select
                value={newLevel ?? undefined}
                onValueChange={(v) => setNewLevel(v as AccessLevel)}
              >
                <SelectTrigger id={`lvl-${item.grantId}`} className="w-52">
                  <SelectValue placeholder="Choose a level" />
                </SelectTrigger>
                <SelectContent>
                  {ACCESS_LEVELS.filter((l) => l !== item.level).map((l) => (
                    <SelectItem key={l} value={l}>
                      {ACCESS_LEVEL_LABELS[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-1">
            <label htmlFor={`note-${item.grantId}`} className="text-sm font-medium">
              {editing === 'revoke' ? 'Why is access being removed?' : 'Note (optional)'}
            </label>
            <Textarea
              id={`note-${item.grantId}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={decide.isPending}
              onClick={() =>
                send(editing, { note, newLevel: editing === 'change' ? newLevel : null })
              }
            >
              {editing === 'revoke' ? 'Revoke access' : 'Change level'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

function SystemCard({
  name,
  items,
  reviewId,
  readOnly,
}: {
  name: string
  items: AccessReviewItem[]
  reviewId: string
  readOnly: boolean
}) {
  const decided = items.filter((i) => i.decision).length
  return (
    <Card>
      <CardHeader className="items-center">
        <CardTitle className="text-base">{name}</CardTitle>
        <span className="text-sm text-muted tabular-nums">
          {decided} of {items.length} decided
        </span>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <ul>
          {items.map((item) => (
            <ItemRow key={item.grantId} item={item} reviewId={reviewId} readOnly={readOnly} />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/** Confirmation shown once the review is signed off: where the evidence went. */
function EvidenceConfirmation({ review }: { review: AccessReviewSummary }) {
  const org = useOrgSlug()
  const e = review.evidence
  return (
    <section
      aria-labelledby="signed-off-title"
      data-testid="signed-off-confirmation"
      className="flex gap-3 rounded-lg border border-ok/40 bg-ok-soft px-4 py-4"
    >
      <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <h2 id="signed-off-title" className="text-md font-semibold text-ok">
          Signed off
          {review.signedOffAt ? (
            <>
              {' '}
              <DateText value={review.signedOffAt} relative />
            </>
          ) : null}
          {review.signedOffByName ? ` by ${review.signedOffByName}` : ''}
        </h2>
        <p className="text-base">
          {review.counts.revoke
            ? `${plural(review.counts.revoke, 'grant')} revoked and `
            : 'No grants revoked and '}
          {review.counts.change
            ? `${plural(review.counts.change, 'level')} changed.`
            : 'no levels changed.'}{' '}
          Every reviewed grant now shows today as its last review.
        </p>
        {e ? (
          <p className="text-base" data-testid="evidence-link">
            Evidence recorded on{' '}
            <Link
              href={securityPaths.control(org, e.controlId)}
              className="font-medium text-accent hover:underline"
            >
              the access control’s evidence timeline
            </Link>
            .
          </p>
        ) : (
          <p className="text-sm text-muted">
            No evidence was recorded because this organisation has no access control to attach it
            to.
          </p>
        )}
      </div>
    </section>
  )
}

export function ReviewPage({ id }: { id: string }) {
  const org = useOrgSlug()
  const can = useCan()
  const query = useAccessReview(org, id)
  const keepAll = useKeepAll(org, id)
  const signOff = useSignOffReview(org, id)
  const [confirm, setConfirm] = useState(false)

  const fallback = recordFallback(query, securityPaths.reviews(org))
  if (fallback || !query.data) return fallback
  const r = query.data
  const open = r.status === 'in_progress'
  const edit = can('security.edit') && open
  const undecided = r.total - r.decided
  const bySystem = r.systemIds
    .map((sid) => ({
      id: sid,
      name: r.items.find((i) => i.systemId === sid)?.systemName ?? '',
      items: r.items.filter((i) => i.systemId === sid),
    }))
    .filter((g) => g.items.length)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`Access review ${r.period}`}
        id={r.ref}
        status={
          open ? (
            <span className="flex items-center gap-1.5">
              <StatusPill status="in_progress" />
              <DuePill state={r.dueState} days={r.daysLeft} />
            </span>
          ) : (
            <StatusPill status="signed_off" />
          )
        }
        breadcrumbs={securityCrumbs(
          { label: 'Access reviews', href: securityPaths.reviews(org) },
          { label: r.ref },
        )}
        className="pb-0"
        actions={
          edit ? (
            <>
              <Button
                variant="secondary"
                disabled={!undecided || keepAll.isPending}
                onClick={() =>
                  keepAll.mutate(undefined, {
                    onSuccess: () => toast.success(`Kept ${plural(undecided, 'grant')}`),
                    onError: (e) => toastError(e),
                  })
                }
              >
                Keep all undecided{undecided ? ` (${undecided})` : ''}
              </Button>
              <Button variant="primary" disabled={undecided > 0} onClick={() => setConfirm(true)}>
                <ClipboardCheckIcon aria-hidden="true" /> Sign off review
              </Button>
            </>
          ) : null
        }
      />
      <MetadataStrip
        items={[
          { label: 'Period', value: r.period },
          { label: 'Ends', value: <CalendarDate value={r.dueAt} /> },
          { label: 'Reviewer', value: r.reviewerName },
          { label: 'Systems', value: String(r.systemIds.length) },
          { label: 'Grants', value: String(r.total) },
          {
            label: r.status === 'signed_off' ? 'Signed off' : 'Started',
            value: <DateText value={r.signedOffAt ?? r.createdAt} relative />,
          },
        ]}
      />

      {r.status === 'signed_off' ? <EvidenceConfirmation review={r} /> : null}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex min-w-60 flex-1 flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">Progress</span>
              <span data-testid="review-progress" className="tabular-nums">
                {r.decided} of {r.total} decided
              </span>
            </div>
            <Progress
              value={r.total ? (r.decided / r.total) * 100 : 0}
              aria-label={`${r.decided} of ${r.total} grants decided`}
            />
          </div>
          <ul className="flex gap-4 text-sm" aria-label="Decisions so far">
            <li>
              <span className="font-semibold text-ok tabular-nums">{r.counts.keep}</span> keep
            </li>
            <li>
              <span className="font-semibold text-bad tabular-nums">{r.counts.revoke}</span> revoke
            </li>
            <li>
              <span className="font-semibold text-warn tabular-nums">{r.counts.change}</span> change
            </li>
          </ul>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {bySystem.map((g) => (
          <SystemCard key={g.id} name={g.name} items={g.items} reviewId={r.id} readOnly={!edit} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityFeed targetType="access_review" targetId={r.id} />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Sign off ${r.ref}?`}
        description={
          <>
            This ends {plural(r.counts.revoke, 'grant')} and changes the level of{' '}
            {plural(r.counts.change, 'grant')}, stamps all {r.total} grants as reviewed today and
            records evidence for the access control. A signed-off review can’t be reopened. Remove
            revoked access in the systems themselves too.
          </>
        }
        confirmLabel="Sign off review"
        pending={signOff.isPending}
        onConfirm={() =>
          signOff.mutate(r.version, {
            onSuccess: () => {
              setConfirm(false)
              toast.success(`Signed off ${r.ref}`)
            },
            onError: (e) => {
              setConfirm(false)
              toastError(e)
            },
          })
        }
      />
    </div>
  )
}
