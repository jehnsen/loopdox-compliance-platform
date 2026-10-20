'use client'

import { useState, type ComponentProps, type FormEvent, type ReactNode } from 'react'
import {
  BetweenHorizontalEndIcon,
  BetweenHorizontalStartIcon,
  BetweenVerticalEndIcon,
  BetweenVerticalStartIcon,
  CheckIcon,
  ChevronDownIcon,
  EllipsisIcon,
  FileSymlinkIcon,
  LinkIcon,
  Table2Icon,
  TableIcon,
  Trash2Icon,
} from 'lucide-react'
import type { DocumentLookupItem } from '@/lib/api/types'
import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { BlockStyle, FormatState } from './commands'
import type { TableOp } from './tables'

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** "Mod-Alt-1" → "⌘⌥1" on a Mac, "Ctrl+Alt+1" elsewhere. */
export function keyLabel(keys: string): string {
  const parts = keys.split('-')
  if (IS_MAC) {
    const glyph: Record<string, string> = { Mod: '⌘', Alt: '⌥', Shift: '⇧' }
    return parts.map((p) => glyph[p] ?? (p.length === 1 ? p.toUpperCase() : p)).join('')
  }
  return parts.map((p) => (p === 'Mod' ? 'Ctrl' : p.length === 1 ? p.toUpperCase() : p)).join('+')
}

export const toolButtonClass =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-40 aria-pressed:bg-accent-soft aria-pressed:text-accent data-[state=open]:bg-surface-2 data-[state=open]:text-fg [&_svg]:size-4'

/** Toolbar button; keeps the editor's selection by not taking focus on mouse down. */
export function ToolButton({
  label,
  shortcut,
  pressed,
  className,
  children,
  ...props
}: Omit<ComponentProps<'button'>, 'aria-label'> & {
  label: string
  shortcut?: string
  /** Toggle state for formats like bold; omit for plain actions. */
  pressed?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          onMouseDown={(e) => e.preventDefault()}
          className={cn(toolButtonClass, className)}
          {...props}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut ? <span className="ml-2 opacity-70">{keyLabel(shortcut)}</span> : null}
      </TooltipContent>
    </Tooltip>
  )
}

export function ToolDivider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line" />
}

// ---------------------------------------------------------------------------
// Paragraph style
// ---------------------------------------------------------------------------

const STYLES: { level: BlockStyle; label: string; hint: string; shortcut: string; cls: string }[] =
  [
    { level: 0, label: 'Normal text', hint: '', shortcut: 'Mod-Alt-0', cls: 'text-base' },
    {
      level: 2,
      label: 'Section heading',
      hint: 'H2',
      shortcut: 'Mod-Alt-1',
      cls: 'text-md font-semibold',
    },
    {
      level: 3,
      label: 'Subsection heading',
      hint: 'H3',
      shortcut: 'Mod-Alt-2',
      cls: 'text-base font-semibold',
    },
    {
      level: 4,
      label: 'Minor heading',
      hint: 'H4',
      shortcut: 'Mod-Alt-3',
      cls: 'text-sm font-semibold',
    },
  ]

function styleLabel(block: FormatState['block']): string {
  if (block === 1) return 'Title heading'
  if (block >= 5) return 'Small heading'
  return STYLES.find((s) => s.level === block)?.label ?? 'Normal text'
}

export function StyleMenu({
  value,
  onPick,
  onClose,
}: {
  value: FormatState['block']
  onPick: (level: BlockStyle) => void
  onClose: () => void
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            onMouseDown={(e) => e.preventDefault()}
            className="inline-flex h-8 w-40 shrink-0 items-center justify-between gap-1 rounded-md px-2.5 text-base text-fg transition-colors hover:bg-surface-2 data-[state=open]:bg-surface-2"
            aria-label={`Text style: ${styleLabel(value)}`}
          >
            <span className="truncate">{styleLabel(value)}</span>
            <ChevronDownIcon className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Text style</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        className="w-72"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          onClose()
        }}
      >
        {STYLES.map((s) => (
          <DropdownMenuItem key={s.level} onSelect={() => onPick(s.level)} className="gap-3">
            <span className="flex w-4 justify-center">
              {value === s.level ? <CheckIcon className="text-accent!" aria-hidden="true" /> : null}
            </span>
            <span className={cn('flex-1 whitespace-nowrap text-fg', s.cls)}>{s.label}</span>
            <span className="font-mono text-2xs text-muted">{keyLabel(s.shortcut)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export function LinkPopover({
  open,
  onOpenChange,
  initialText,
  onInsert,
  onClose,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialText: string
  onInsert: (text: string, url: string) => void
  onClose: () => void
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Insert link"
              onMouseDown={(e) => e.preventDefault()}
              className={toolButtonClass}
            >
              <LinkIcon />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          Insert link <span className="ml-2 opacity-70">{keyLabel('Mod-k')}</span>
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="start"
        className="w-80"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          onClose()
        }}
      >
        {/* Remounted on every open so the fields start from the current selection. */}
        {open ? (
          <LinkForm
            initialText={initialText}
            onSubmit={(text, url) => {
              onInsert(text, url)
              onOpenChange(false)
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function LinkForm({
  initialText,
  onSubmit,
}: {
  initialText: string
  onSubmit: (text: string, url: string) => void
}) {
  const [text, setText] = useState(initialText)
  const [url, setUrl] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (url.trim()) onSubmit(text, url)
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="md-link-text">Text</Label>
        <Input
          id="md-link-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What readers see"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="md-link-url">Link</Label>
        <Input
          id="md-link-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          autoFocus
          inputMode="url"
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="sm" disabled={!url.trim()}>
          Insert link
        </Button>
      </div>
    </form>
  )
}

export function PagePicker({
  lookup,
  onPick,
  onClose,
}: {
  lookup: DocumentLookupItem[]
  onPick: (docId: string) => void
  onClose: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Link to another policy"
              onMouseDown={(e) => e.preventDefault()}
              className={toolButtonClass}
            >
              <FileSymlinkIcon />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          Link to another policy <span className="ml-2 opacity-70">[[</span>
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="start"
        className="w-96 p-0"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          onClose()
        }}
      >
        <Command label="Policies">
          <CommandInput placeholder="Search by ID or title…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No policy matches.</CommandEmpty>
            {lookup.map((d) => (
              <CommandItem
                key={d.id}
                value={`${d.docId} ${d.title}`}
                onSelect={() => {
                  onPick(d.docId)
                  setOpen(false)
                }}
              >
                <span className="font-mono text-xs font-medium text-muted">{d.docId}</span>
                <span className="truncate">{d.title}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const GRID_ROWS = 8
const GRID_COLS = 8

export function TablePicker({
  onPick,
  onClose,
}: {
  onPick: (rows: number, cols: number) => void
  onClose: () => void
}) {
  const [open, setOpen] = useState(false)
  const [size, setSize] = useState<[number, number]>([3, 3])
  const pick = (r: number, c: number) => {
    onPick(r, c)
    setOpen(false)
  }
  const clamp = (n: number, max: number, min: number) =>
    Math.min(max, Math.max(min, Number.isFinite(n) ? Math.round(n) : min))
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Insert table"
              onMouseDown={(e) => e.preventDefault()}
              className={toolButtonClass}
            >
              <TableIcon />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Insert table</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="start"
        className="w-auto"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          onClose()
        }}
      >
        <div className="flex flex-col gap-3">
          {/* Mouse shortcut; the fields below do the same from the keyboard. */}
          <div
            aria-hidden="true"
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1rem)` }}
          >
            {Array.from({ length: GRID_ROWS * GRID_COLS }, (_, i) => {
              const r = Math.max(2, Math.floor(i / GRID_COLS) + 1)
              const c = (i % GRID_COLS) + 1
              const on = Math.floor(i / GRID_COLS) + 1 <= size[0] && c <= size[1]
              return (
                <button
                  key={i}
                  type="button"
                  tabIndex={-1}
                  onMouseEnter={() => setSize([r, c])}
                  onClick={() => pick(r, c)}
                  className={cn(
                    'size-4 rounded-[3px] border transition-colors',
                    on ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface',
                  )}
                />
              )
            })}
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              pick(size[0], size[1])
            }}
          >
            <div className="grid gap-1">
              <Label htmlFor="md-table-rows">Rows</Label>
              <Input
                id="md-table-rows"
                type="number"
                min={2}
                max={50}
                value={size[0]}
                onChange={(e) => setSize([clamp(e.target.valueAsNumber, 50, 2), size[1]])}
                className="w-16"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="md-table-cols">Columns</Label>
              <Input
                id="md-table-cols"
                type="number"
                min={1}
                max={12}
                value={size[1]}
                onChange={(e) => setSize([size[0], clamp(e.target.valueAsNumber, 12, 1)])}
                className="w-16"
              />
            </div>
            <Button type="submit" variant="primary" size="md">
              Insert
            </Button>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  )
}

const TABLE_ACTIONS: { op: TableOp; label: string; icon: ReactNode; needs?: 'row' | 'col' }[] = [
  { op: 'row-above', label: 'Insert row above', icon: <BetweenHorizontalStartIcon /> },
  { op: 'row-below', label: 'Insert row below', icon: <BetweenHorizontalEndIcon /> },
  { op: 'col-left', label: 'Insert column left', icon: <BetweenVerticalStartIcon /> },
  { op: 'col-right', label: 'Insert column right', icon: <BetweenVerticalEndIcon /> },
  { op: 'del-row', label: 'Delete row', icon: <Trash2Icon />, needs: 'row' },
  { op: 'del-col', label: 'Delete column', icon: <Trash2Icon />, needs: 'col' },
]

/** Row and column actions; shown while the cursor is in a table. */
export function TableMenu({
  format,
  onOp,
  onClose,
}: {
  format: FormatState
  onOp: (op: TableOp) => void
  onClose: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onMouseDown={(e) => e.preventDefault()}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-accent-soft px-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft/70 data-[state=open]:bg-accent-soft/70"
      >
        <Table2Icon className="size-4" aria-hidden="true" />
        Table
        <ChevronDownIcon className="size-3.5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          onClose()
        }}
      >
        {TABLE_ACTIONS.map((a, i) => (
          <div key={a.op}>
            {i === 4 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              onSelect={() => onOp(a.op)}
              disabled={
                (a.needs === 'row' && !format.canDeleteRow) ||
                (a.needs === 'col' && !format.canDeleteColumn)
              }
              variant={a.needs ? 'danger' : undefined}
            >
              {a.icon}
              {a.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// More: less-used formatting and view options
// ---------------------------------------------------------------------------

export interface MenuAction {
  label: string
  icon?: ReactNode
  shortcut?: string
  /** Renders a checkbox item (a view toggle) instead of an action. */
  checked?: boolean
  separatorBefore?: boolean
  onSelect: () => void
}

export function MoreMenu({ actions, onClose }: { actions: MenuAction[]; onClose: () => void }) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            onMouseDown={(e) => e.preventDefault()}
            aria-label="More formatting"
            className={toolButtonClass}
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>More formatting</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        className="w-64"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          onClose()
        }}
      >
        {actions.map((a) => (
          <div key={a.label}>
            {a.separatorBefore ? <DropdownMenuSeparator /> : null}
            {a.checked === undefined ? (
              <DropdownMenuItem onSelect={a.onSelect}>
                {a.icon}
                <span className="flex-1">{a.label}</span>
                {a.shortcut ? (
                  <span className="font-mono text-2xs text-muted">{keyLabel(a.shortcut)}</span>
                ) : null}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuCheckboxItem checked={a.checked} onCheckedChange={a.onSelect}>
                {a.label}
              </DropdownMenuCheckboxItem>
            )}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
