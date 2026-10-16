import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ColumnDef } from '@tanstack/react-table'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataTable } from '@/components/data-table/data-table'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

interface Row {
  id: string
  title: string
}

const columns: ColumnDef<Row>[] = [
  {
    id: 'title',
    header: 'Title',
    cell: ({ row }) => <a href={`/records/${row.original.id}`}>{row.original.title}</a>,
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: () => <button type="button">Archive</button>,
  },
  { id: 'note', header: 'Note', cell: () => <span>plain text</span> },
]

function renderTable(rowHref?: (r: Row) => string) {
  return render(
    <DataTable<Row>
      columns={columns}
      data={{ items: [{ id: 'r1', title: 'First record' }], page: 1, pageSize: 25, total: 1 }}
      isLoading={false}
      isError={false}
      onRetry={() => undefined}
      params={{ page: 1, pageSize: 25, sort: null, q: '', filters: {}, hidden: [] }}
      setParams={() => undefined}
      getRowId={(r) => r.id}
      label="Records"
      emptyState={null}
      rowHref={rowHref}
    />,
  )
}

afterEach(() => {
  push.mockReset()
  vi.restoreAllMocks()
})

describe('DataTable rowHref', () => {
  it('opens the record when the row is clicked', async () => {
    renderTable((r) => `/records/${r.id}`)
    await userEvent.click(screen.getByText('plain text'))
    expect(push).toHaveBeenCalledWith('/records/r1')
  })

  it('leaves clicks on buttons inside the row alone', async () => {
    renderTable((r) => `/records/${r.id}`)
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(push).not.toHaveBeenCalled()
  })

  it('does not navigate while the user is selecting text', () => {
    renderTable((r) => `/records/${r.id}`)
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'plain',
    } as unknown as Selection)
    fireEvent.click(screen.getByText('plain text'))
    expect(push).not.toHaveBeenCalled()
  })

  it('opens a new tab on Ctrl-click instead of navigating', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    renderTable((r) => `/records/${r.id}`)
    fireEvent.click(screen.getByText('plain text'), { ctrlKey: true })
    expect(open).toHaveBeenCalledWith('/records/r1', '_blank', 'noopener')
    expect(push).not.toHaveBeenCalled()
  })

  it('rows without rowHref are not clickable', async () => {
    renderTable()
    await userEvent.click(screen.getByText('plain text'))
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByText('plain text').closest('tr')).not.toHaveClass('cursor-pointer')
  })
})
