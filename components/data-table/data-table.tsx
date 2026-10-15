'use client'

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type RowData,
  type RowSelectionState,
} from '@tanstack/react-table'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  Columns3Icon,
  DownloadIcon,
  Rows3Icon,
  SearchIcon,
  XIcon,
} from 'lucide-react'
import { downloadFile, isApiError } from '@/lib/api/client'
import type { ListQuery, ListResponse } from '@/lib/api/types'
import { cn } from '@/lib/utils/cn'
import { formatNumber } from '@/lib/utils/format'
import { PAGE_SIZES, type ListParams } from '@/lib/utils/use-list-params'
import { useDebouncedValue } from '@/lib/utils/use-debounced-value'
import { useUiPrefs } from '@/components/providers/ui-prefs'
import { ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match the library's
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Header text used in the column visibility menu. */
    label?: string
    /** Server sort key; the column is sortable when set. */
    sortKey?: string
    /** Can't be hidden from the columns menu. */
    alwaysVisible?: boolean
    align?: 'left' | 'right'
    className?: string
  }
}

export interface DataTableProps<T> {
  /** Define columns with `id` + `cell`; sorting happens on the server via `meta.sortKey`. */
  columns: ColumnDef<T>[]
  data: ListResponse<T> | undefined
  isLoading: boolean
  isError: boolean
  /** Background refetch (keeps old rows visible). */
  isFetching?: boolean
  error?: unknown
  onRetry: () => void
  params: ListParams
  setParams: (patch: Partial<ListParams>) => void
  /** Current API query, used by Export. */
  query?: ListQuery
  getRowId: (row: T) => string
  /** Accessible table name. */
  label: string
  searchPlaceholder?: string
  /** Filter controls shown next to the search box. */
  filters?: ReactNode
  /** Shown when there are no rows and no filters are active. */
  emptyState: ReactNode
  /** Shown when filters match nothing. */
  noMatchesText?: string
  /** API path that returns the export file for the current filters. */
  exportPath?: string
  /** Enables row selection; receives the selected IDs for bulk actions. */
  bulkActions?: (selectedIds: string[], clear: () => void) => ReactNode
  rowClassName?: (row: T) => string | undefined
  /**
   * Groups consecutive rows under a heading row (a framework, a status). Rows keep the
   * server's order, so the groups only make sense while the sort is the default one.
   */
  groupBy?: { key: (row: T) => string; heading: (key: string, rows: T[]) => ReactNode } | null
}

/** Splits rows into consecutive groups for `groupBy`; without it, one group with no heading. */
function groupRows<T>(
  rows: Row<T>[],
  groupBy: DataTableProps<T>['groupBy'],
): { key: string; heading: ReactNode; rows: Row<T>[] }[] {
  if (!groupBy) return [{ key: 'all', heading: null, rows }]
  const groups: { key: string; heading: ReactNode; rows: Row<T>[] }[] = []
  for (const row of rows) {
    const key = groupBy.key(row.original)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.rows.push(row)
    else groups.push({ key, heading: null, rows: [row] })
  }
  for (const g of groups)
    g.heading = groupBy.heading(
      g.key,
      g.rows.map((r) => r.original),
    )
  return groups
}

function SortIcon({ dir }: { dir: 'asc' | 'desc' | null }) {
  if (dir === 'asc') return <ArrowUpIcon className="size-3.5" aria-hidden="true" />
  if (dir === 'desc') return <ArrowDownIcon className="size-3.5" aria-hidden="true" />
  return <ChevronsUpDownIcon className="size-3.5 opacity-50" aria-hidden="true" />
}

export function DataTable<T>({
  columns: baseColumns,
  data,
  isLoading,
  isError,
  isFetching,
  error,
  onRetry,
  params,
  setParams,
  query,
  getRowId,
  label,
  searchPlaceholder = 'Search…',
  filters,
  emptyState,
  noMatchesText = 'Nothing matches these filters.',
  exportPath,
  bulkActions,
  rowClassName,
  groupBy,
}: DataTableProps<T>) {
  const { density, setDensity } = useUiPrefs()
  const [search, setSearch] = useState(params.q)
  const debounced = useDebouncedValue(search, 300)
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [exporting, setExporting] = useState(false)

  // Push the debounced search into the URL.
  useEffect(() => {
    if (debounced !== params.q) setParams({ q: debounced })
    // Only react to typing, not to URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const selectionColumn: ColumnDef<T> = {
    id: '_select',
    meta: { alwaysVisible: true, className: 'w-10' },
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all rows on this page"
        checked={
          table.getIsAllPageRowsSelected()
            ? true
            : table.getIsSomePageRowsSelected()
              ? 'indeterminate'
              : false
        }
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(v === true)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(v === true)}
      />
    ),
  }
  const columns = bulkActions ? [selectionColumn, ...baseColumns] : baseColumns

  // The React Compiler isn't enabled; TanStack Table re-derives its state every render.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getRowId: (row) => getRowId(row),
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    rowCount: data?.total ?? 0,
    state: {
      rowSelection: selection,
      columnVisibility: Object.fromEntries(params.hidden.map((id) => [id, false])),
    },
    onRowSelectionChange: setSelection,
    enableRowSelection: Boolean(bulkActions),
  })

  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / params.pageSize))
  const from = total === 0 ? 0 : (params.page - 1) * params.pageSize + 1
  const to = Math.min(total, params.page * params.pageSize)
  const filtered = Object.values(params.filters).some((v) => v.length) || Boolean(params.q)
  const selectedIds = Object.keys(selection).filter((k) => selection[k])
  const rowHeight = density === 'compact' ? 'h-8' : 'h-10'

  const sortDir = (key: string | undefined): 'asc' | 'desc' | null => {
    if (!key || !params.sort) return null
    if (params.sort === key) return 'asc'
    if (params.sort === `-${key}`) return 'desc'
    return null
  }
  const cycleSort = (key: string) => {
    const dir = sortDir(key)
    setParams({ sort: dir === null ? key : dir === 'asc' ? `-${key}` : null })
  }

  const runExport = async () => {
    if (!exportPath) return
    setExporting(true)
    try {
      const { page: _p, pageSize: _s, ...rest } = query ?? {}
      await downloadFile(exportPath, rest)
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'The export failed. Try again.')
    } finally {
      setExporting(false)
    }
  }

  const hideable = table.getAllLeafColumns().filter((c) => !c.columnDef.meta?.alwaysVisible)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={`Search ${label.toLowerCase()}`}
            className="pl-8"
          />
        </div>
        {filters}
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setParams({
                q: '',
                filters: Object.fromEntries(Object.keys(params.filters).map((k) => [k, []])),
              })
            }}
          >
            <XIcon aria-hidden="true" /> Clear filters
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Row density">
                <Rows3Icon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Density</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={density}
                onValueChange={(v) => setDensity(v === 'compact' ? 'compact' : 'comfortable')}
              >
                <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {hideable.length ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Choose columns">
                  <Columns3Icon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hideable.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={!params.hidden.includes(c.id)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(v) =>
                      setParams({
                        page: params.page,
                        hidden: v
                          ? params.hidden.filter((h) => h !== c.id)
                          : [...params.hidden, c.id],
                      })
                    }
                  >
                    {c.columnDef.meta?.label ?? c.id}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {exportPath ? (
            <Button
              variant="secondary"
              size="md"
              onClick={() => void runExport()}
              disabled={exporting || total === 0}
            >
              <DownloadIcon aria-hidden="true" />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
          ) : null}
        </div>
      </div>

      {bulkActions && selectedIds.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent-soft px-3 py-1.5 text-sm">
          <span className="font-medium">{selectedIds.length} selected</span>
          {bulkActions(selectedIds, () => setSelection({}))}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelection({})}>
            Clear selection
          </Button>
        </div>
      ) : null}

      {isError ? (
        <ErrorState
          title="Couldn’t load this list"
          body={isApiError(error) ? error.message : 'Check your connection and try again.'}
          onRetry={onRetry}
        />
      ) : !isLoading && total === 0 && !filtered ? (
        emptyState
      ) : (
        <div
          className={cn(
            'overflow-x-auto rounded-lg border border-line bg-surface',
            isFetching && !isLoading && 'opacity-70',
          )}
        >
          <table
            className="w-full min-w-[640px] border-collapse text-base tabular-nums"
            aria-label={label}
            aria-busy={isLoading || isFetching}
          >
            <thead className="bg-surface-2 text-left">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const meta = header.column.columnDef.meta
                    const dir = sortDir(meta?.sortKey)
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={
                          dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined
                        }
                        className={cn(
                          'h-9 border-b border-line px-3 text-xs font-semibold whitespace-nowrap text-muted',
                          meta?.align === 'right' && 'text-right',
                          meta?.className,
                        )}
                      >
                        {meta?.sortKey ? (
                          <button
                            type="button"
                            onClick={() => cycleSort(meta.sortKey ?? '')}
                            className="-mx-1 inline-flex items-center gap-1 rounded-sm px-1 hover:text-fg"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <SortIcon dir={dir} />
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            {isLoading ? (
              <tbody>
                {Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} className={rowHeight}>
                    {table.getVisibleLeafColumns().map((c) => (
                      <td key={c.id} className="border-b border-line px-3">
                        <Skeleton className="h-4 w-full max-w-40" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ) : (
              groupRows(table.getRowModel().rows, groupBy).map((group) => (
                <tbody key={group.key}>
                  {group.heading ? (
                    <tr>
                      <th
                        scope="rowgroup"
                        colSpan={table.getVisibleLeafColumns().length}
                        className="border-b border-line bg-surface-2/60 px-3 py-1.5 text-left text-xs font-semibold text-muted"
                      >
                        {group.heading}
                      </th>
                    </tr>
                  ) : null}
                  {group.rows.map((row) => (
                    <tr
                      key={row.id}
                      data-state={row.getIsSelected() ? 'selected' : undefined}
                      className={cn(
                        rowHeight,
                        'border-b border-line last:border-b-0 hover:bg-surface-2/60 data-[state=selected]:bg-accent-soft',
                        rowClassName?.(row.original),
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className={cn(
                            'px-3 py-1 align-middle',
                            cell.column.columnDef.meta?.align === 'right' && 'text-right',
                            cell.column.columnDef.meta?.className,
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))
            )}
            {!isLoading && total === 0 ? (
              <tbody>
                <tr>
                  <td
                    colSpan={table.getVisibleLeafColumns().length}
                    className="px-3 py-10 text-center text-muted"
                  >
                    {noMatchesText}
                  </td>
                </tr>
              </tbody>
            ) : null}
          </table>
        </div>
      )}

      {!isError && total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <p aria-live="polite">
            {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}
          </p>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">Rows per page</span>
            <Select
              value={String(params.pageSize)}
              onValueChange={(v) => setParams({ pageSize: Number(v) })}
            >
              <SelectTrigger className="h-7 w-18" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="secondary"
              size="icon-sm"
              aria-label="Previous page"
              disabled={params.page <= 1}
              onClick={() => setParams({ page: params.page - 1 })}
            >
              <ChevronLeftIcon />
            </Button>
            <span className="tabular-nums">
              Page {params.page} of {pageCount}
            </span>
            <Button
              variant="secondary"
              size="icon-sm"
              aria-label="Next page"
              disabled={params.page >= pageCount}
              onClick={() => setParams({ page: params.page + 1 })}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
