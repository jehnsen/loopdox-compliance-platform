'use client'

import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { ChevronsUpDownIcon } from 'lucide-react'
import {
  collapseUnchanged,
  diffStats,
  lineDiff,
  toSplitRows,
  wordSegments,
  type DiffLine,
  type Segment,
} from '@/lib/diff'
import { cn } from '@/lib/utils/cn'

export type DiffMode = 'unified' | 'split'

const rowTone: Record<DiffLine['kind'], string> = {
  same: '',
  add: 'bg-ok-soft',
  del: 'bg-bad-soft',
}

const sign: Record<DiffLine['kind'], string> = { same: ' ', add: '+', del: '−' }

function Segments({ segments, kind }: { segments: Segment[]; kind: 'add' | 'del' }) {
  return (
    <>
      {segments.map((s, i) =>
        s.changed ? (
          <mark
            key={i}
            className={cn(
              'rounded-[2px] text-fg',
              kind === 'add' ? 'bg-ok/25' : 'bg-bad/25 line-through decoration-bad/60',
            )}
          >
            {s.text}
          </mark>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        ),
      )}
    </>
  )
}

/** Word-level highlights when a removed line is replaced by exactly one added line. */
function usePairs(lines: DiffLine[]) {
  return useMemo(() => {
    const pairs = new Map<DiffLine, Segment[]>()
    for (const row of toSplitRows(lines)) {
      if (row.left?.kind === 'del' && row.right?.kind === 'add') {
        const segs = wordSegments(row.left.text, row.right.text)
        pairs.set(row.left, segs.old)
        pairs.set(row.right, segs.new)
      }
    }
    return pairs
  }, [lines])
}

function LineText({ line, pairs }: { line: DiffLine; pairs: Map<DiffLine, Segment[]> }) {
  const segs = pairs.get(line)
  if (segs && line.kind !== 'same') return <Segments segments={segs} kind={line.kind} />
  return <>{line.text || ' '}</>
}

function ExpandRow({
  count,
  onClick,
  colSpan,
}: {
  count: number
  onClick: () => void
  colSpan: number
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="border-y border-line bg-surface-2 p-0">
        <button
          type="button"
          onClick={onClick}
          className="flex w-full items-center justify-center gap-1.5 py-1 font-sans text-xs text-muted hover:text-fg"
        >
          <ChevronsUpDownIcon className="size-3.5" aria-hidden="true" />
          Show {count} unchanged {count === 1 ? 'line' : 'lines'}
        </button>
      </td>
    </tr>
  )
}

/**
 * Line diff of two texts, unified or side by side. Unchanged runs collapse
 * behind "Show N lines".
 */
export function DiffView({
  oldText,
  newText,
  mode = 'unified',
  oldLabel,
  newLabel,
  className,
}: {
  oldText: string
  newText: string
  mode?: DiffMode
  oldLabel: string
  newLabel: string
  className?: string
}) {
  const lines = useMemo(() => lineDiff(oldText, newText), [oldText, newText])
  const blocks = useMemo(() => collapseUnchanged(lines), [lines])
  const stats = useMemo(() => diffStats(lines), [lines])
  const pairs = usePairs(lines)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const expand = (id: string) => setExpanded((s) => new Set(s).add(id))

  const visible = (fn: (lines: DiffLine[]) => ReactNode) =>
    blocks.map((b, i) =>
      b.type === 'lines' || expanded.has(b.id) ? (
        <Fragment key={i}>{fn(b.lines)}</Fragment>
      ) : (
        <ExpandRow
          key={i}
          count={b.lines.length}
          onClick={() => expand(b.id)}
          colSpan={mode === 'split' ? 4 : 3}
        />
      ),
    )

  const num = 'w-10 select-none px-2 text-right align-top text-muted'
  return (
    <div className={cn('overflow-hidden rounded-lg border border-line bg-surface', className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-surface-2 px-3 py-2 text-sm">
        <span className="font-medium">
          {oldLabel} → {newLabel}
        </span>
        <span className="text-ok tabular-nums">+{stats.added} added</span>
        <span className="text-bad tabular-nums">−{stats.removed} removed</span>
      </div>
      {stats.added === 0 && stats.removed === 0 ? (
        <p className="px-3 py-6 text-center text-base text-muted">No differences in the text.</p>
      ) : (
        <div className="overflow-x-auto">
          <table
            className="w-full border-collapse font-mono text-[13px] leading-5"
            aria-label={`Changes from ${oldLabel} to ${newLabel}`}
          >
            {mode === 'unified' ? (
              <tbody>
                {visible((ls) =>
                  ls.map((l, i) => (
                    <tr key={i} className={rowTone[l.kind]}>
                      <td className={num}>{l.oldNo ?? ''}</td>
                      <td className={num}>{l.newNo ?? ''}</td>
                      <td className="px-2 whitespace-pre-wrap">
                        <span
                          aria-hidden="true"
                          className={cn(
                            'mr-2 inline-block w-2 select-none',
                            l.kind === 'add' ? 'text-ok' : 'text-bad',
                          )}
                        >
                          {sign[l.kind]}
                        </span>
                        <span className="sr-only">
                          {l.kind === 'add' ? 'Added: ' : l.kind === 'del' ? 'Removed: ' : ''}
                        </span>
                        <LineText line={l} pairs={pairs} />
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            ) : (
              <tbody>
                {visible((ls) =>
                  toSplitRows(ls).map((r, i) => (
                    <tr key={i}>
                      <td className={cn(num, r.left && rowTone[r.left.kind])}>
                        {r.left?.oldNo ?? ''}
                      </td>
                      <td
                        className={cn(
                          'w-1/2 border-r border-line px-2 align-top whitespace-pre-wrap',
                          r.left ? rowTone[r.left.kind] : 'bg-surface-2/50',
                        )}
                      >
                        {r.left ? (
                          <>
                            {r.left.kind === 'del' ? (
                              <span className="sr-only">Removed: </span>
                            ) : null}
                            <LineText line={r.left} pairs={pairs} />
                          </>
                        ) : null}
                      </td>
                      <td className={cn(num, r.right && rowTone[r.right.kind])}>
                        {r.right?.newNo ?? ''}
                      </td>
                      <td
                        className={cn(
                          'w-1/2 px-2 align-top whitespace-pre-wrap',
                          r.right ? rowTone[r.right.kind] : 'bg-surface-2/50',
                        )}
                      >
                        {r.right ? (
                          <>
                            {r.right.kind === 'add' ? (
                              <span className="sr-only">Added: </span>
                            ) : null}
                            <LineText line={r.right} pairs={pairs} />
                          </>
                        ) : null}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            )}
          </table>
        </div>
      )}
    </div>
  )
}

export default DiffView
