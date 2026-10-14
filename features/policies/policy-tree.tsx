'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo, useState, type DragEvent } from 'react'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  GripVerticalIcon,
  MoreHorizontalIcon,
} from 'lucide-react'
import type { DocumentLookupItem } from '@/lib/api/types'
import { cn } from '@/lib/utils/cn'
import { useOrgSlug } from '@/components/providers/session-provider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StatusDot } from '@/features/policies/doc-status'
import { policyPaths } from '@/features/policies/paths'

type Children = Map<string | null, DocumentLookupItem[]>

export function buildChildren(items: DocumentLookupItem[]): Children {
  const map: Children = new Map()
  for (const it of items) {
    const list = map.get(it.parentId) ?? []
    list.push(it)
    map.set(it.parentId, list)
  }
  for (const list of map.values())
    list.sort((a, b) => a.order - b.order || a.docId.localeCompare(b.docId))
  // Orphans (parent not visible to this user) show at the top level.
  const ids = new Set(items.map((i) => i.id))
  for (const [parent, list] of [...map.entries()]) {
    if (parent !== null && !ids.has(parent)) {
      map.set(null, [...(map.get(null) ?? []), ...list])
      map.delete(parent)
    }
  }
  return map
}

function isAncestor(children: Children, ancestorId: string, id: string): boolean {
  const stack = [...(children.get(ancestorId) ?? [])]
  while (stack.length) {
    const n = stack.pop()
    if (!n) break
    if (n.id === id) return true
    stack.push(...(children.get(n.id) ?? []))
  }
  return false
}

interface DropTarget {
  id: string
  position: 'before' | 'after'
}

/**
 * Sections → documents. Editors can drag a page before or after another page
 * (moving it into that page's section), or use "Move up / Move down".
 */
export function PolicyTree({
  items,
  canReorder,
  onReorder,
}: {
  items: DocumentLookupItem[]
  canReorder: boolean
  onReorder: (parentId: string | null, orderedIds: string[], movedLabel: string) => void
}) {
  const org = useOrgSlug()
  const pathname = usePathname()
  const children = useMemo(() => buildChildren(items), [items])
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [dragging, setDragging] = useState<string | null>(null)
  const [drop, setDrop] = useState<DropTarget | null>(null)
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const move = (dragId: string, target: DropTarget) => {
    const dragged = byId.get(dragId)
    const targetItem = byId.get(target.id)
    if (!dragged || !targetItem || dragId === target.id) return
    if (isAncestor(children, dragId, target.id)) return
    const parentId = targetItem.parentId
    const siblings = (children.get(parentId) ?? []).filter((s) => s.id !== dragId).map((s) => s.id)
    const at = siblings.indexOf(target.id) + (target.position === 'after' ? 1 : 0)
    siblings.splice(at, 0, dragId)
    onReorder(parentId, siblings, `${dragged.docId} ${dragged.title}`)
  }

  const step = (item: DocumentLookupItem, delta: -1 | 1) => {
    const siblings = (children.get(item.parentId) ?? []).map((s) => s.id)
    const i = siblings.indexOf(item.id)
    const j = i + delta
    if (j < 0 || j >= siblings.length) return
    ;[siblings[i], siblings[j]] = [siblings[j] as string, siblings[i] as string]
    onReorder(item.parentId, siblings, `${item.docId} ${item.title}`)
  }

  const onDragOver = (e: DragEvent, item: DocumentLookupItem) => {
    if (!dragging || dragging === item.id || isAncestor(children, dragging, item.id)) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const position = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    if (drop?.id !== item.id || drop.position !== position) setDrop({ id: item.id, position })
  }

  const renderLevel = (parentId: string | null, depth: number) => {
    const list = children.get(parentId) ?? []
    if (!list.length) return null
    return (
      <ul className="flex flex-col">
        {list.map((item, index) => {
          const kids = children.get(item.id) ?? []
          const open = !collapsed.has(item.id)
          const href = policyPaths.view(org, item.id)
          const active = pathname === href
          return (
            <li key={item.id} className="relative">
              {drop?.id === item.id && drop.position === 'before' ? (
                <span
                  className="absolute inset-x-1 top-0 h-0.5 rounded-full bg-accent"
                  aria-hidden="true"
                />
              ) : null}
              <div
                draggable={canReorder}
                onDragStart={(e) => {
                  setDragging(item.id)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', item.id)
                }}
                onDragEnd={() => {
                  setDragging(null)
                  setDrop(null)
                }}
                onDragOver={(e) => onDragOver(e, item)}
                onDragLeave={() => setDrop((d) => (d?.id === item.id ? null : d))}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragging && drop) move(dragging, drop)
                  setDragging(null)
                  setDrop(null)
                }}
                className={cn(
                  'group flex h-8 items-center gap-1 rounded-md pr-1 text-base hover:bg-surface-2',
                  active && 'bg-accent-soft hover:bg-accent-soft',
                  dragging === item.id && 'opacity-50',
                )}
                style={{ paddingLeft: `${depth * 14 + 4}px` }}
              >
                {kids.length ? (
                  <button
                    type="button"
                    onClick={() => toggle(item.id)}
                    aria-expanded={open}
                    aria-label={`${open ? 'Collapse' : 'Expand'} ${item.title}`}
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted hover:text-fg"
                  >
                    <ChevronRightIcon
                      className={cn('size-3.5 transition-transform', open && 'rotate-90')}
                    />
                  </button>
                ) : (
                  <span className="size-5 shrink-0" aria-hidden="true" />
                )}
                {canReorder ? (
                  <GripVerticalIcon
                    className="size-3.5 shrink-0 cursor-grab text-muted/50 group-hover:text-muted"
                    aria-hidden="true"
                  />
                ) : null}
                <StatusDot status={item.status} reviewState={item.reviewState} />
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className="flex min-w-0 flex-1 items-baseline gap-1.5 truncate py-1 pl-1"
                  draggable={false}
                >
                  <span className="shrink-0 font-mono text-xs text-muted">{item.docId}</span>
                  <span className={cn('truncate', depth === 0 && kids.length > 0 && 'font-medium')}>
                    {item.title}
                  </span>
                </Link>
                {canReorder ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted opacity-0 group-hover:opacity-100 hover:bg-surface focus-visible:opacity-100 data-[state=open]:opacity-100"
                      aria-label={`Reorder ${item.docId}`}
                    >
                      <MoreHorizontalIcon className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem disabled={index === 0} onSelect={() => step(item, -1)}>
                        <ArrowUpIcon /> Move up
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={index === list.length - 1}
                        onSelect={() => step(item, 1)}
                      >
                        <ArrowDownIcon /> Move down
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
              {drop?.id === item.id && drop.position === 'after' ? (
                <span
                  className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-accent"
                  aria-hidden="true"
                />
              ) : null}
              {kids.length && open ? renderLevel(item.id, depth + 1) : null}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <nav aria-label="Policy tree" className="text-base">
      {renderLevel(null, 0)}
    </nav>
  )
}
