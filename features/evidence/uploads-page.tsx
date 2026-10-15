'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { UploadIcon } from 'lucide-react'
import { useEvidenceList } from '@/lib/api/hooks/use-evidence'
import type { EvidenceItem } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { RESULT_LABELS } from '@/lib/evidence'
import { useListParams } from '@/lib/utils/use-list-params'
import { useOrgSlug } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { DataTable } from '@/components/data-table/data-table'
import { FacetFilter } from '@/components/data-table/facet-filter'
import { DateText } from '@/components/date-text'
import { FileLink } from '@/components/file-dropzone'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { evidenceCrumbs, evidencePaths, ResultPill } from '@/features/evidence/shared'
import { UploadEvidenceDialog } from '@/features/evidence/upload-evidence-dialog'

const FILTER_KEYS = ['result'] as const

function useColumns(org: string): ColumnDef<EvidenceItem>[] {
  return useMemo(
    () => [
      {
        id: 'collectedAt',
        header: 'Collected',
        meta: { label: 'Collected', sortKey: 'collectedAt', alwaysVisible: true },
        cell: ({ row }) => (
          <DateText value={row.original.collectedAt} className="whitespace-nowrap" />
        ),
      },
      {
        id: 'control',
        header: 'Control',
        meta: { label: 'Control', sortKey: 'controlReference', alwaysVisible: true },
        cell: ({ row }) => (
          <Link
            href={evidencePaths.control(org, row.original.controlId, row.original.id)}
            className="hover:underline"
            title={row.original.controlTitle}
          >
            <IdChip>{row.original.controlReference}</IdChip>
          </Link>
        ),
      },
      {
        id: 'summary',
        header: 'What it shows',
        meta: { label: 'What it shows', alwaysVisible: true, className: 'min-w-72' },
        cell: ({ row }) => <span className="line-clamp-2">{row.original.summary}</span>,
      },
      {
        id: 'result',
        header: 'Result',
        meta: { label: 'Result', sortKey: 'result' },
        cell: ({ row }) => <ResultPill result={row.original.result} />,
      },
      {
        id: 'file',
        header: 'File',
        meta: { label: 'File', className: 'min-w-48' },
        cell: ({ row }) =>
          row.original.file ? (
            <FileLink file={row.original.file} />
          ) : (
            <span className="text-muted">None</span>
          ),
      },
      {
        id: 'by',
        header: 'Uploaded by',
        meta: { label: 'Uploaded by' },
        cell: ({ row }) => row.original.collectedByName,
      },
    ],
    [org],
  )
}

/** Evidence people uploaded, newest first. Connector and review evidence is on each control. */
export function UploadsPage() {
  const org = useOrgSlug()
  const can = useCan()
  const [uploading, setUploading] = useState(false)
  const { params, setParams, query } = useListParams({ filterKeys: FILTER_KEYS })
  const uploadsQuery = useMemo(() => ({ ...query, source: 'upload' }), [query])
  const list = useEvidenceList(org, uploadsQuery)
  const columns = useColumns(org)
  const upload = can('evidence.edit') ? (
    <Button variant="primary" onClick={() => setUploading(true)}>
      <UploadIcon aria-hidden="true" /> Upload evidence
    </Button>
  ) : null

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Uploads"
        breadcrumbs={evidenceCrumbs({ label: 'Uploads' })}
        description="Files people have uploaded as evidence: reports, screenshots, minutes and exports."
        actions={upload}
      />
      {uploading ? <UploadEvidenceDialog onClose={() => setUploading(false)} /> : null}
      <DataTable
        label="Uploads"
        columns={columns}
        data={list.data}
        isLoading={list.isLoading}
        isFetching={list.isFetching}
        isError={list.isError}
        error={list.error}
        onRetry={() => void list.refetch()}
        params={params}
        setParams={setParams}
        query={uploadsQuery}
        getRowId={(e) => e.id}
        searchPlaceholder="Search by control, summary or file name"
        filters={
          <FacetFilter
            label="Result"
            options={(['pass', 'fail', 'info'] as const).map((r) => ({
              value: r,
              label: RESULT_LABELS[r],
            }))}
            selected={params.filters.result ?? []}
            onChange={(v) => setParams({ filters: { result: v } })}
          />
        }
        emptyState={
          <EmptyState
            icon={UploadIcon}
            title="No uploads yet"
            body="Upload a report, screenshot or export to show a control working. It appears here and on the control’s timeline."
            actions={upload}
          />
        }
      />
    </div>
  )
}
