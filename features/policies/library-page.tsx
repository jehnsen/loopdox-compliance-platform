'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMemo } from 'react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { LibraryIcon, PlusIcon } from 'lucide-react'
import { useDocumentLookup, useDocuments, useReorderDocuments } from '@/lib/api/hooks/use-documents'
import { useMembers } from '@/lib/api/hooks/use-members'
import { isApiError, orgPath } from '@/lib/api/client'
import type { DocumentSummary } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { cn } from '@/lib/utils/cn'
import { useListParams } from '@/lib/utils/use-list-params'
import { useOrgSlug } from '@/components/providers/session-provider'
import { useEntitlement } from '@/components/gate'
import { IdChip } from '@/components/chips'
import { DataTable } from '@/components/data-table/data-table'
import { FacetFilter } from '@/components/data-table/facet-filter'
import { CalendarDate, DateText } from '@/components/date-text'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DOC_STATUS_LABELS, DocStatusPill, ReviewPill } from '@/features/policies/doc-status'
import { policyPaths } from '@/features/policies/paths'
import { PolicyTree } from '@/features/policies/policy-tree'

const FILTER_KEYS = ['status', 'owner', 'review', 'framework', 'parent'] as const

function useColumns(org: string): ColumnDef<DocumentSummary>[] {
  return useMemo(
    () => [
      {
        id: 'docId',
        header: 'ID',
        meta: { label: 'ID', sortKey: 'docId', alwaysVisible: true, className: 'w-24' },
        cell: ({ row }) => <IdChip>{row.original.docId}</IdChip>,
      },
      {
        id: 'title',
        header: 'Title',
        meta: { label: 'Title', sortKey: 'title', alwaysVisible: true, className: 'min-w-56' },
        cell: ({ row }) => (
          <Link
            href={policyPaths.view(org, row.original.id)}
            className="font-medium hover:text-accent hover:underline"
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status', sortKey: 'status' },
        cell: ({ row }) => <DocStatusPill status={row.original.status} />,
      },
      {
        id: 'owner',
        header: 'Owner',
        meta: { label: 'Owner', sortKey: 'ownerName' },
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.ownerName}</span>,
      },
      {
        id: 'version',
        header: 'Version',
        meta: { label: 'Version', sortKey: 'currentVersion' },
        cell: ({ row }) => {
          const d = row.original
          return (
            <span className="font-mono text-sm whitespace-nowrap">
              v{d.currentVersion}
              {d.approvedVersion && d.approvedVersion !== d.currentVersion ? (
                <span className="ml-1 font-sans text-xs text-muted">
                  (v{d.approvedVersion} approved)
                </span>
              ) : null}
            </span>
          )
        },
      },
      {
        id: 'nextReview',
        header: 'Next review',
        meta: { label: 'Next review', sortKey: 'nextReviewDate' },
        cell: ({ row }) =>
          row.original.nextReviewDate ? (
            <span className="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
              <CalendarDate value={row.original.nextReviewDate} />
              <ReviewPill state={row.original.reviewState} />
            </span>
          ) : (
            <span className="text-muted">—</span>
          ),
      },
      {
        id: 'updatedAt',
        header: 'Last edited',
        meta: { label: 'Last edited', sortKey: 'updatedAt' },
        cell: ({ row }) => (
          <DateText
            value={row.original.updatedAt}
            relative
            className="whitespace-nowrap text-muted"
          />
        ),
      },
    ],
    [org],
  )
}

type Layout = 'tree' | 'table'

export function PolicyLibraryPage() {
  const org = useOrgSlug()
  const can = useCan()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const layout: Layout = searchParams.get('view') === 'table' ? 'table' : 'tree'
  const { params, setParams, query } = useListParams({ filterKeys: FILTER_KEYS })
  const list = useDocuments(org, query)
  const lookup = useDocumentLookup(org)
  const members = useMembers(org)
  const reorder = useReorderDocuments(org)
  const columns = useColumns(org)
  const { enabled: hasEvidence } = useEntitlement('evidence')
  const canEdit = can('policies.edit')

  const setLayout = (l: Layout) => {
    const next = new URLSearchParams(searchParams.toString())
    if (l === 'table') next.set('view', 'table')
    else next.delete('view')
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false })
  }

  const sections = (lookup.data ?? []).filter(
    (d) => d.parentId === null && (lookup.data ?? []).some((c) => c.parentId === d.id),
  )

  const filters = (
    <>
      <FacetFilter
        label="Status"
        options={(['draft', 'in_review', 'approved', 'retired'] as const)
          .filter((s) => can('policies.read_drafts') || s === 'approved')
          .map((s) => ({ value: s, label: DOC_STATUS_LABELS[s] }))}
        selected={params.filters.status ?? []}
        onChange={(v) => setParams({ filters: { status: v } })}
      />
      <FacetFilter
        label="Owner"
        options={(members.data ?? [])
          .filter((m) => !m.roles.every((r) => r === 'auditor'))
          .map((m) => ({ value: m.userId, label: m.name }))}
        selected={params.filters.owner ?? []}
        onChange={(v) => setParams({ filters: { owner: v } })}
      />
      <FacetFilter
        label="Review"
        options={[
          { value: 'overdue', label: 'Overdue' },
          { value: 'due_soon', label: 'Due soon' },
        ]}
        selected={params.filters.review ?? []}
        onChange={(v) => setParams({ filters: { review: v } })}
      />
      {sections.length ? (
        <FacetFilter
          label="Section"
          options={sections.map((s) => ({ value: s.id, label: s.title }))}
          selected={params.filters.parent ?? []}
          onChange={(v) => setParams({ filters: { parent: v } })}
        />
      ) : null}
      {hasEvidence ? (
        <FacetFilter
          label="Framework"
          options={[
            { value: 'ISO27001:2022', label: 'ISO/IEC 27001:2022' },
            { value: 'DPA', label: 'Data Privacy Act' },
            { value: 'NPC', label: 'NPC issuances' },
          ]}
          selected={params.filters.framework ?? []}
          onChange={(v) => setParams({ filters: { framework: v } })}
        />
      ) : null}
    </>
  )

  const newButton = canEdit ? (
    <Button asChild variant="primary">
      <Link href={policyPaths.new(org)}>
        <PlusIcon aria-hidden="true" /> New policy
      </Link>
    </Button>
  ) : null

  const tree = (
    <aside
      aria-label="Policy tree"
      className={cn(
        'max-h-80 min-w-0 overflow-y-auto rounded-lg border border-line bg-surface p-2 lg:sticky lg:top-18 lg:max-h-[calc(100dvh-6rem)]',
        layout === 'table' && 'hidden',
      )}
    >
      {lookup.isLoading ? (
        <div className="flex flex-col gap-2 p-1">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-6" />
          ))}
        </div>
      ) : (
        <PolicyTree
          items={lookup.data ?? []}
          canReorder={canEdit}
          onReorder={(parentId, orderedIds, movedLabel) =>
            reorder.mutate(
              { parentId, orderedIds },
              {
                onSuccess: () => toast.success(`Moved ${movedLabel}`),
                onError: (e) =>
                  toast.error(isApiError(e) ? e.message : 'Couldn’t reorder. Try again.'),
              },
            )
          }
        />
      )}
    </aside>
  )

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Policy library"
        description="Every controlled document, its status and when it’s next due for review."
        actions={newButton}
      />
      <div className="mb-3 flex items-center gap-2">
        <span id="layout-label" className="text-sm text-muted">
          Layout
        </span>
        <div
          role="radiogroup"
          aria-labelledby="layout-label"
          className="flex rounded-md border border-line bg-surface p-0.5"
        >
          {(['tree', 'table'] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={layout === l}
              onClick={() => setLayout(l)}
              className={cn(
                'h-6 rounded-sm px-2.5 text-sm text-muted hover:text-fg',
                layout === l && 'bg-accent-soft font-medium text-fg',
              )}
            >
              {l === 'tree' ? 'Tree and table' : 'Table only'}
            </button>
          ))}
        </div>
      </div>
      <div className={cn('grid gap-4', layout === 'tree' && 'lg:grid-cols-[18rem_minmax(0,1fr)]')}>
        {tree}
        <div className="min-w-0">
          <DataTable
            label="Policies"
            columns={columns}
            data={list.data}
            isLoading={list.isLoading}
            isFetching={list.isFetching}
            isError={list.isError}
            error={list.error}
            onRetry={() => void list.refetch()}
            params={params}
            setParams={setParams}
            query={query}
            getRowId={(d) => d.id}
            rowHref={(d) => policyPaths.view(org, d.id)}
            searchPlaceholder="Search by ID, title or owner"
            filters={filters}
            exportPath={orgPath(org, '/documents/export')}
            rowClassName={(d) => (d.status === 'retired' ? 'text-muted' : undefined)}
            emptyState={
              <EmptyState
                icon={LibraryIcon}
                title="No policies yet"
                body="Policies, procedures and section pages live here, with their versions, approvals and review dates. Start from a template."
                actions={newButton}
              />
            }
          />
        </div>
      </div>
    </div>
  )
}
