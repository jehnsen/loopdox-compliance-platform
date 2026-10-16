'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangleIcon,
  ArchiveIcon,
  BadgeCheckIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CheckIcon,
  CircleDotIcon,
  ClockIcon,
  FileTextIcon,
  GitCommitHorizontalIcon,
  InfoIcon,
  LinkIcon,
  MessageSquareWarningIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SendIcon,
  Trash2Icon,
  UserRoundIcon,
  type LucideIcon,
} from 'lucide-react'
import { useDocument, useDocumentLookup } from '@/lib/api/hooks/use-documents'
import { isApiError } from '@/lib/api/client'
import type { DocumentDetail } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { PERMISSION_LABELS } from '@/lib/auth/permissions'
import { cn } from '@/lib/utils/cn'
import { useOrgSlug } from '@/components/providers/session-provider'
import { CalendarDate, DateText } from '@/components/date-text'
import { MetadataStrip } from '@/components/metadata-strip'
import { PageHeader, type Crumb } from '@/components/page-header'
import { ErrorState, ForbiddenState, NotFoundState } from '@/components/states'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ActivityFeed } from '@/components/activity-feed'
import { useClassificationLabel } from '@/components/form/classification-select'
import { AcknowledgementsTab } from '@/features/policies/acknowledgements-tab'
import { ControlsTab } from '@/features/policies/controls-tab'
import { DocStatusPill, ReviewPill } from '@/features/policies/doc-status'
import { HistoryTab } from '@/features/policies/history-tab'
import { PageTab } from '@/features/policies/page-tab'
import { policyPaths, type PolicyTab } from '@/features/policies/paths'
import { WorkflowDialogs, type WorkflowDialog } from '@/features/policies/workflow-dialogs'

type Tone = 'info' | 'warn' | 'bad' | 'neutral'

const TONES: Record<Tone, string> = {
  info: 'border-accent/30 bg-accent-soft',
  warn: 'border-warn/30 bg-warn-soft',
  bad: 'border-bad/30 bg-bad-soft',
  neutral: 'border-line bg-surface',
}

export function Banner({
  tone,
  icon: Icon,
  title,
  children,
  actions,
  testId,
}: {
  tone: Tone
  icon: LucideIcon
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
  testId?: string
}) {
  return (
    <div
      role="status"
      data-testid={testId}
      className={cn(
        'flex animate-in flex-wrap items-start gap-3 rounded-lg border px-4 py-3.5 duration-200 fade-in-0',
        TONES[tone],
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-5 shrink-0',
          tone === 'warn'
            ? 'text-warn'
            : tone === 'bad'
              ? 'text-bad'
              : tone === 'info'
                ? 'text-accent'
                : 'text-muted',
        )}
        aria-hidden="true"
      />
      <div className="flex min-w-48 flex-1 flex-col gap-0.5">
        <p className="font-medium">{title}</p>
        {children ? <div className="text-base">{children}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

function WorkflowBanners({
  doc,
  onOpen,
}: {
  doc: DocumentDetail
  onOpen: (d: WorkflowDialog) => void
}) {
  const org = useOrgSlug()
  const can = useCan()
  const last = doc.workflow[0]
  const submitted = doc.workflow.find(
    (w) => w.type === 'submit' && w.version === doc.currentVersion,
  )
  const banners: ReactNode[] = []

  if (doc.status === 'in_review') {
    if (can('policies.approve')) {
      banners.push(
        <Banner
          key="review"
          testId="workflow-banner"
          tone="warn"
          icon={ClockIcon}
          title={`v${doc.currentVersion} is ready for your decision`}
          actions={
            <>
              <Button variant="secondary" onClick={() => onOpen('reject')}>
                Request changes
              </Button>
              <Button variant="primary" onClick={() => onOpen('approve')}>
                <CheckIcon aria-hidden="true" /> Approve v{doc.currentVersion}
              </Button>
            </>
          }
        >
          {submitted ? (
            <>
              {submitted.actorName} submitted it <DateText value={submitted.at} relative />
              {submitted.note ? <>: “{submitted.note}”</> : '.'}
            </>
          ) : null}
        </Banner>,
      )
    } else {
      banners.push(
        <Banner
          key="review"
          testId="workflow-banner"
          tone="warn"
          icon={ClockIcon}
          title="Waiting for approval"
        >
          v{doc.currentVersion} was submitted
          {submitted ? (
            <>
              {' '}
              by {submitted.actorName} <DateText value={submitted.at} relative />
            </>
          ) : null}
          . An approver needs to approve it or request changes.
        </Banner>,
      )
    }
  }

  if (doc.status === 'draft' && last?.type === 'reject') {
    banners.push(
      <Banner
        key="rejected"
        tone="bad"
        icon={MessageSquareWarningIcon}
        title={`${last.actorName} requested changes to v${last.version}`}
      >
        “{last.note}” <DateText value={last.at} relative className="text-muted" />
      </Banner>,
    )
  }

  if ((doc.status === 'draft' || doc.status === 'in_review') && doc.approvedVersion !== null) {
    banners.push(
      <Banner
        key="approved-on-record"
        testId="approved-on-record"
        tone="info"
        icon={InfoIcon}
        title={`v${doc.approvedVersion} is the approved version on record`}
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href={policyPaths.version(org, doc.id, doc.approvedVersion)}>
              Read v{doc.approvedVersion}
            </Link>
          </Button>
        }
      >
        You’re viewing {doc.status === 'draft' ? 'draft' : 'the version in review,'} v
        {doc.currentVersion}. Staff keep seeing v{doc.approvedVersion} until v{doc.currentVersion}{' '}
        is approved.
      </Banner>,
    )
  }

  if (
    doc.status === 'draft' &&
    doc.requiresApproval &&
    can('policies.edit') &&
    last?.type !== 'reject' &&
    doc.approvedVersion === null
  ) {
    banners.push(
      <Banner
        key="draft"
        tone="neutral"
        icon={PencilIcon}
        title="Draft"
        actions={
          <Button variant="secondary" size="sm" onClick={() => onOpen('submit')}>
            <SendIcon aria-hidden="true" /> Submit v{doc.currentVersion} for review
          </Button>
        }
      >
        Only editors and approvers can see this page until it’s approved.
      </Banner>,
    )
  }

  if (doc.reviewState === 'overdue' && doc.nextReviewDate) {
    banners.push(
      <Banner
        key="overdue"
        testId="overdue-banner"
        tone="bad"
        icon={AlertTriangleIcon}
        title="Review overdue"
        actions={
          can('policies.edit') ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={policyPaths.edit(org, doc.id)}>Start review</Link>
            </Button>
          ) : null
        }
      >
        This policy was due for review on <CalendarDate value={doc.nextReviewDate} />. Review it,
        make any changes, and approve it again to set the next review date.
      </Banner>,
    )
  } else if (doc.reviewState === 'due_soon' && doc.nextReviewDate) {
    banners.push(
      <Banner key="due" tone="warn" icon={ClockIcon} title="Review due soon">
        The next review is due on <CalendarDate value={doc.nextReviewDate} />.
      </Banner>,
    )
  }

  if (doc.status === 'retired') {
    const retired = doc.workflow.find((w) => w.type === 'retire')
    banners.push(
      <Banner key="retired" tone="neutral" icon={ArchiveIcon} title="Retired">
        This document is no longer in force and is kept for reference.
        {retired?.note ? <> Reason: “{retired.note}”</> : null}
      </Banner>,
    )
  }

  return banners.length ? <div className="flex flex-col gap-2">{banners}</div> : null
}

function PolicySkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-4 w-56" />
      <div className="flex items-start gap-4">
        <Skeleton className="hidden size-12 rounded-lg sm:block" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-96 max-w-full" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
      </div>
      <Skeleton className="h-18 rounded-lg" />
      <Skeleton className="h-10" />
      <Skeleton className="h-96 rounded-lg" />
    </div>
  )
}

export function PolicyPage({ id }: { id: string }) {
  const org = useOrgSlug()
  const can = useCan()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = useDocument(org, id)
  const lookup = useDocumentLookup(org)
  const classificationLabel = useClassificationLabel()
  const [dialog, setDialog] = useState<WorkflowDialog>(null)

  if (query.isLoading) return <PolicySkeleton />
  if (query.isError || !query.data) {
    const e = query.error
    if (isApiError(e) && e.isNotFound) return <NotFoundState homeHref={policyPaths.library(org)} />
    if (isApiError(e) && e.isForbidden)
      return (
        <ForbiddenState permissionLabel={PERMISSION_LABELS['policies.read']} homeHref={`/${org}`} />
      )
    return <ErrorState onRetry={() => void query.refetch()} />
  }
  const doc = query.data

  const readsDrafts = can('policies.read_drafts')
  const tabs: { value: PolicyTab; label: string; show: boolean }[] = [
    { value: 'page', label: 'Page', show: true },
    { value: 'history', label: 'History', show: true },
    {
      value: 'acknowledgements',
      label: 'Acknowledgements',
      show: readsDrafts && doc.requiresApproval,
    },
    { value: 'controls', label: 'Controls', show: can('evidence.read') },
    { value: 'activity', label: 'Activity', show: readsDrafts },
  ]
  const requested = searchParams.get('tab') as PolicyTab | null
  const tab: PolicyTab = tabs.find((t) => t.value === requested && t.show)?.value ?? 'page'
  const setTab = (value: string) => {
    const next = new URLSearchParams()
    if (value !== 'page') next.set('tab', value)
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false })
  }

  const parent = lookup.data?.find((d) => d.id === doc.parentId)
  const breadcrumbs: Crumb[] = [
    { label: 'Policies', href: policyPaths.library(org) },
    ...(parent ? [{ label: parent.title, href: policyPaths.view(org, parent.id) }] : []),
    { label: doc.docId },
  ]

  const canEdit = can('policies.edit') && doc.status !== 'retired'
  const canSubmit = can('policies.edit') && doc.status === 'draft' && doc.requiresApproval
  const canRetire = can('policies.approve') && doc.status !== 'retired'
  const canDelete = can('policies.edit') && doc.approvedVersion === null

  const actions = (
    <>
      {canSubmit ? (
        <Button variant="secondary" onClick={() => setDialog('submit')}>
          <SendIcon aria-hidden="true" /> Submit v{doc.currentVersion} for review
        </Button>
      ) : null}
      {canEdit ? (
        <Button asChild variant="primary">
          <Link href={policyPaths.edit(org, doc.id)}>
            <PencilIcon aria-hidden="true" /> Edit
          </Link>
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon" aria-label="More actions">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              void navigator.clipboard
                .writeText(`${window.location.origin}${policyPaths.view(org, doc.id)}`)
                .then(() => toast.success('Link copied'))
            }}
          >
            <LinkIcon /> Copy link
          </DropdownMenuItem>
          {canRetire || canDelete ? <DropdownMenuSeparator /> : null}
          {canRetire ? (
            <DropdownMenuItem onSelect={() => setDialog('retire')}>
              <ArchiveIcon /> Retire {doc.docId}
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <DropdownMenuItem variant="danger" onSelect={() => setDialog('delete')}>
              <Trash2Icon /> Delete draft
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={doc.title}
        icon={FileTextIcon}
        description={
          <>
            {classificationLabel(doc.classification)} · Reviewed every {doc.reviewCycleMonths}{' '}
            months
            {doc.requiresApproval ? '' : ' · Published without approval'}
          </>
        }
        breadcrumbs={breadcrumbs}
        id={doc.docId}
        version={doc.content?.version ?? doc.currentVersion}
        status={
          <>
            <DocStatusPill status={doc.status} />
            <ReviewPill state={doc.reviewState} />
          </>
        }
        actions={actions}
        className="pb-0"
      />
      <WorkflowBanners doc={doc} onOpen={setDialog} />
      <MetadataStrip
        items={[
          { label: 'Status', icon: CircleDotIcon, value: <DocStatusPill status={doc.status} /> },
          {
            label: 'Version',
            icon: GitCommitHorizontalIcon,
            value: (
              <span className="font-mono">
                v{doc.currentVersion}
                {doc.approvedVersion && doc.approvedVersion !== doc.currentVersion ? (
                  <span className="ml-1 font-sans text-sm text-muted">
                    (v{doc.approvedVersion} approved)
                  </span>
                ) : null}
              </span>
            ),
          },
          { label: 'Owner', icon: UserRoundIcon, value: doc.ownerName },
          {
            label: 'Effective',
            icon: CalendarCheckIcon,
            value: <CalendarDate value={doc.effectiveDate} />,
          },
          {
            label: 'Next review',
            icon: CalendarClockIcon,
            value:
              doc.status === 'retired' ? (
                'Not reviewed'
              ) : (
                <CalendarDate value={doc.nextReviewDate} />
              ),
          },
          {
            label: 'Approved by',
            icon: BadgeCheckIcon,
            value: doc.approvedByName ?? <span className="text-muted">Not yet approved</span>,
          },
        ]}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Policy sections">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
        </TabsList>
        <TabsContent value="page">
          <PageTab doc={doc} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab doc={doc} />
        </TabsContent>
        {readsDrafts ? (
          <TabsContent value="acknowledgements">
            <AcknowledgementsTab doc={doc} />
          </TabsContent>
        ) : null}
        {can('evidence.read') ? (
          <TabsContent value="controls">
            <ControlsTab doc={doc} />
          </TabsContent>
        ) : null}
        {readsDrafts ? (
          <TabsContent value="activity">
            <ActivityFeed targetType="document" targetId={doc.id} />
          </TabsContent>
        ) : null}
      </Tabs>
      <WorkflowDialogs doc={doc} open={dialog} onOpenChange={setDialog} />
    </div>
  )
}
