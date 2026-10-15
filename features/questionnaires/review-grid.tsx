'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { AlertCircleIcon, CheckIcon, MoreHorizontalIcon, PencilIcon } from 'lucide-react'
import { useUpdateQuestionnaireRow } from '@/lib/api/hooks/use-questionnaires'
import { isApiError } from '@/lib/api/client'
import { qk } from '@/lib/api/query-keys'
import type { Questionnaire, QuestionnaireRow, QuestionnaireRowStatus } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { ROW_STATUS_LABELS } from '@/lib/questionnaires'
import { ANSWER_MAX } from '@/lib/schemas/questionnaires'
import { cn } from '@/lib/utils/cn'
import { useQueryClient } from '@tanstack/react-query'
import { useOrgSlug } from '@/components/providers/session-provider'
import { FacetFilter } from '@/components/data-table/facet-filter'
import { MarkdownView } from '@/components/markdown/markdown-view'
import { EmptyState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Kbd } from '@/components/ui/kbd'
import { Textarea } from '@/components/ui/textarea'

const STATUSES: QuestionnaireRowStatus[] = ['needs_input', 'draft', 'edited', 'approved']

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/**
 * The review grid: question, draft answer, sources and status for every row.
 * Keyboard: ↑/↓ move between rows, Enter edits, ⌘/Ctrl Enter approves (or saves and
 * approves while editing), Esc cancels an edit.
 */
export function ReviewGrid({ questionnaire: q }: { questionnaire: Questionnaire }) {
  const org = useOrgSlug()
  const can = useCan()
  const qc = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const update = useUpdateQuestionnaireRow(org, q.id)
  const helpId = useId()
  const editable = can('questionnaires.edit')
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>())
  const [active, setActive] = useState<string | null>(q.rows[0]?.id ?? null)
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)

  const statusFilter = (searchParams.get('status')?.split(',') ?? []).filter(
    (s): s is QuestionnaireRowStatus => (STATUSES as string[]).includes(s),
  )
  const rows = statusFilter.length ? q.rows.filter((r) => statusFilter.includes(r.status)) : q.rows
  const setFilter = (values: string[]) => {
    const next = new URLSearchParams(searchParams.toString())
    if (values.length) next.set('status', values.join(','))
    else next.delete('status')
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false })
  }

  const focusRow = (id: string | undefined) => {
    if (!id) return
    setActive(id)
    rowRefs.current.get(id)?.focus()
  }

  const save = (
    row: QuestionnaireRow,
    patch: { draftAnswer?: string; status?: QuestionnaireRowStatus },
    after?: () => void,
  ) => {
    setRowError(null)
    update.mutate(
      { rowId: row.id, ifVersion: row.version, ...patch },
      {
        onSuccess: (r) => {
          setEditing(null)
          if (patch.status === 'approved') toast.success(`Approved answer ${r.index}`)
          after?.()
        },
        onError: (e) => {
          if (isApiError(e) && e.isConflict) {
            void qc.invalidateQueries({ queryKey: qk.questionnaires.detail(org, q.id) })
            setRowError({
              id: row.id,
              message: 'Someone else changed this answer. It now shows their version.',
            })
            setEditing(null)
            return
          }
          setRowError({
            id: row.id,
            message: isApiError(e) ? e.message : 'Couldn’t save. Try again.',
          })
        },
      },
    )
  }

  const startEdit = (row: QuestionnaireRow) => {
    if (!editable) return
    setEditing({ id: row.id, text: row.draftAnswer })
  }

  const approve = (row: QuestionnaireRow, text?: string) => {
    if (!editable) return
    const answer = text ?? row.draftAnswer
    if (!answer.trim()) {
      setRowError({ id: row.id, message: 'Write an answer before approving this row.' })
      return
    }
    const i = rows.findIndex((r) => r.id === row.id)
    // After approving, move on to the next row so a reviewer can keep going.
    save(
      row,
      {
        status: 'approved',
        ...(text !== undefined && text !== row.draftAnswer ? { draftAnswer: text } : {}),
      },
      () => focusRow(rows[i + 1]?.id ?? row.id),
    )
  }

  const onRowKeyDown = (
    e: KeyboardEvent<HTMLTableRowElement>,
    row: QuestionnaireRow,
    i: number,
  ) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusRow(rows[i + 1]?.id)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusRow(rows[i - 1]?.id)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusRow(rows[0]?.id)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusRow(rows.at(-1)?.id)
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      approve(row)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      startEdit(row)
    }
  }

  const onEditorKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, row: QuestionnaireRow) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setEditing(null)
      focusRow(row.id)
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && editing) {
      e.preventDefault()
      approve(row, editing.text)
    }
  }

  const mod = isMac() ? '⌘' : 'Ctrl'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <FacetFilter
          label="Status"
          options={STATUSES.map((s) => ({ value: s, label: ROW_STATUS_LABELS[s] }))}
          selected={statusFilter}
          onChange={setFilter}
        />
        <p
          id={helpId}
          className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted"
        >
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move
          </span>
          {editable ? (
            <>
              <span className="flex items-center gap-1">
                <Kbd>Enter</Kbd> edit
              </span>
              <span className="flex items-center gap-1">
                <Kbd>{mod}</Kbd>
                <Kbd>Enter</Kbd> approve
              </span>
              <span className="flex items-center gap-1">
                <Kbd>Esc</Kbd> cancel
              </span>
            </>
          ) : null}
        </p>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table
            className="w-full min-w-[860px] border-collapse text-base"
            role="grid"
            aria-label="Answers"
            aria-describedby={helpId}
          >
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th scope="col" className="h-9 w-10 px-3 font-semibold">
                  #
                </th>
                <th scope="col" className="w-[30%] px-3 font-semibold">
                  Question
                </th>
                <th scope="col" className="px-3 font-semibold">
                  Draft answer
                </th>
                <th scope="col" className="w-48 px-3 font-semibold">
                  Sources
                </th>
                <th scope="col" className="w-40 px-3 font-semibold">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isEditing = editing?.id === row.id
                const isActive = active === row.id
                const error = rowError?.id === row.id ? rowError.message : null
                return (
                  <tr
                    key={row.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(row.id, el)
                      else rowRefs.current.delete(row.id)
                    }}
                    tabIndex={isActive ? 0 : -1}
                    aria-selected={isActive}
                    data-status={row.status}
                    onFocus={(e) => {
                      if (e.target === e.currentTarget) setActive(row.id)
                    }}
                    onKeyDown={(e) => onRowKeyDown(e, row, i)}
                    className={cn(
                      'border-t border-line align-top outline-none first:border-t-0 focus-visible:bg-accent-soft/40 focus-visible:shadow-[inset_3px_0_0_var(--accent)]',
                      isActive && 'bg-surface-2/40',
                    )}
                  >
                    <td className="px-3 py-3 font-mono text-sm text-muted tabular-nums">
                      {row.index}
                    </td>
                    <td className="px-3 py-3 font-medium">{row.question}</td>
                    <td className="px-3 py-3">
                      {isEditing && editing ? (
                        <div className="flex flex-col gap-2">
                          <label htmlFor={`answer-${row.id}`} className="sr-only">
                            Answer to question {row.index}
                          </label>
                          <Textarea
                            id={`answer-${row.id}`}
                            value={editing.text}
                            onChange={(e) => setEditing({ id: row.id, text: e.target.value })}
                            onKeyDown={(e) => onEditorKeyDown(e, row)}
                            rows={5}
                            maxLength={ANSWER_MAX}
                            // Enter on a row opens this editor, so focus belongs here.
                            autoFocus
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={update.isPending}
                              onClick={() => approve(row, editing.text)}
                            >
                              <CheckIcon aria-hidden="true" /> Save and approve
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={update.isPending}
                              onClick={() =>
                                save(row, { draftAnswer: editing.text }, () => focusRow(row.id))
                              }
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditing(null)
                                focusRow(row.id)
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : row.draftAnswer ? (
                        <MarkdownView
                          markdown={row.draftAnswer}
                          citations={row.citations}
                          className="text-sm"
                        />
                      ) : (
                        <p className="text-sm text-muted">
                          No approved policy covers this. Write the answer yourself.
                        </p>
                      )}
                      {error ? (
                        <p role="alert" className="mt-2 flex items-start gap-1.5 text-sm text-bad">
                          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                          {error}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      {row.citations.length ? (
                        <ol className="flex flex-col gap-1 text-sm">
                          {row.citations.map((c) => (
                            <li key={c.n} className="flex gap-1.5">
                              <span className="text-xs font-semibold text-accent tabular-nums">
                                {c.n}
                              </span>
                              <Link
                                href={c.href}
                                className="hover:text-accent hover:underline"
                                tabIndex={-1}
                              >
                                {c.label}
                              </Link>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <span className="text-sm text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-start gap-2">
                        <StatusPill status={row.status} />
                        {row.editorName &&
                        row.status !== 'draft' &&
                        row.status !== 'needs_input' ? (
                          <span className="text-xs text-muted">by {row.editorName}</span>
                        ) : null}
                        {editable && !isEditing ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Edit answer ${row.index}`}
                              tabIndex={-1}
                              onClick={() => startEdit(row)}
                            >
                              <PencilIcon />
                            </Button>
                            {row.status !== 'approved' ? (
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Approve answer ${row.index}`}
                                tabIndex={-1}
                                disabled={update.isPending || !row.draftAnswer}
                                onClick={() => approve(row)}
                              >
                                <CheckIcon />
                              </Button>
                            ) : null}
                            {row.status !== 'needs_input' ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label={`More for answer ${row.index}`}
                                    tabIndex={-1}
                                  >
                                    <MoreHorizontalIcon />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onSelect={() => save(row, { status: 'needs_input' })}
                                  >
                                    <AlertCircleIcon /> Mark as needing input
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No answers match this filter"
          body="Clear the status filter to see every row."
        />
      )}
    </div>
  )
}
