'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { SirenIcon } from 'lucide-react'
import { useIncidents } from '@/lib/api/hooks/use-privacy'
import type { IncidentSummary } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { en } from '@/lib/i18n/en'
import { ReportIncidentIcon } from '@/lib/nav'
import { INCIDENT_STATUS_LABELS } from '@/lib/privacy'
import { useListParams } from '@/lib/utils/use-list-params'
import { useSession } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { CountdownInline } from '@/components/countdown-clock'
import { DataTable } from '@/components/data-table/data-table'
import { FacetFilter } from '@/components/data-table/facet-filter'
import { DateText } from '@/components/date-text'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/states'
import { SeverityBadge, StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { privacyPaths } from '@/features/privacy/paths'
import { privacyCrumbs } from '@/features/privacy/shared'

const FILTER_KEYS = ['status', 'severity', 'personalData'] as const

function useColumns(org: string, tz: string): ColumnDef<IncidentSummary>[] {
  return useMemo(
    () => [
      {
        id: 'ref',
        header: 'ID',
        meta: { label: 'ID', sortKey: 'ref', alwaysVisible: true, className: 'w-36' },
        cell: ({ row }) => <IdChip>{row.original.ref}</IdChip>,
      },
      {
        id: 'title',
        header: 'Incident',
        meta: { label: 'Incident', sortKey: 'title', alwaysVisible: true, className: 'min-w-56' },
        cell: ({ row }) => (
          <Link
            href={privacyPaths.incidentView(org, row.original.id)}
            className="font-medium hover:text-accent hover:underline"
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        id: 'discoveredAt',
        header: 'Discovered',
        meta: { label: 'Discovered', sortKey: 'discoveredAt' },
        cell: ({ row }) => (
          <DateText value={row.original.discoveredAt} relative className="whitespace-nowrap" />
        ),
      },
      {
        id: 'severity',
        header: 'Severity',
        meta: { label: 'Severity', sortKey: 'severity' },
        cell: ({ row }) =>
          row.original.severity ? (
            <SeverityBadge severity={row.original.severity} />
          ) : (
            <span className="text-sm text-muted">Not assessed</span>
          ),
      },
      {
        id: 'personalData',
        header: 'Personal data',
        meta: { label: 'Personal data', sortKey: 'personalDataInvolved' },
        cell: ({ row }) => (row.original.personalDataInvolved ? 'Yes' : 'No'),
      },
      {
        id: 'deadline',
        header: 'NPC deadline',
        meta: { label: 'NPC deadline', sortKey: 'notificationDeadline' },
        cell: ({ row }) =>
          row.original.notificationDeadline && row.original.status !== 'closed' ? (
            <CountdownInline
              deadline={row.original.notificationDeadline}
              notifiedAt={row.original.npcNotifiedAt}
              notificationRequired={row.original.notificationRequired}
              timezone={tz}
            />
          ) : row.original.npcNotifiedAt ? (
            <span className="text-sm text-muted">Notified</span>
          ) : (
            <span className="text-muted">—</span>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status', sortKey: 'status' },
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
    ],
    [org, tz],
  )
}

export function IncidentListPage() {
  const { org } = useSession()
  const can = useCan()
  const { params, setParams, query } = useListParams({ filterKeys: FILTER_KEYS })
  const list = useIncidents(org.slug, query)
  const columns = useColumns(org.slug, org.timezone)
  const reportButton = can('incidents.report') ? (
    <Button asChild variant="primary">
      <Link href={privacyPaths.incidentReport(org.slug)}>
        <ReportIncidentIcon aria-hidden="true" /> {en.shell.reportIncident}
      </Link>
    </Button>
  ) : null

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Incidents and breaches"
        breadcrumbs={privacyCrumbs({ label: 'Incidents and breaches' })}
        description="Security incidents and personal data breaches. When personal data is involved, the NPC must be notified within 72 hours of discovery."
        actions={reportButton}
      />
      <DataTable
        label="Incidents"
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
        getRowId={(i) => i.id}
        rowHref={(i) => privacyPaths.incidentView(org.slug, i.id)}
        searchPlaceholder="Search by ID or title"
        rowClassName={(i) => (i.status === 'closed' ? 'text-muted' : undefined)}
        filters={
          <>
            <FacetFilter
              label="Status"
              options={Object.entries(INCIDENT_STATUS_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              selected={params.filters.status ?? []}
              onChange={(v) => setParams({ filters: { status: v } })}
            />
            <FacetFilter
              label="Severity"
              options={[
                { value: 'critical', label: 'Critical' },
                { value: 'high', label: 'High' },
                { value: 'medium', label: 'Medium' },
                { value: 'low', label: 'Low' },
                { value: 'none', label: 'Not assessed' },
              ]}
              selected={params.filters.severity ?? []}
              onChange={(v) => setParams({ filters: { severity: v } })}
            />
            <FacetFilter
              label="Personal data"
              options={[
                { value: 'true', label: 'Involved' },
                { value: 'false', label: 'Not involved' },
              ]}
              selected={params.filters.personalData ?? []}
              onChange={(v) => setParams({ filters: { personalData: v } })}
            />
          </>
        }
        emptyState={
          <EmptyState
            icon={SirenIcon}
            title="No incidents recorded"
            body="When something goes wrong, report it here straight away. If personal data is involved, the 72-hour clock starts from when it was discovered."
            actions={reportButton}
          />
        }
      />
    </div>
  )
}
