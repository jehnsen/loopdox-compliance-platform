'use client'

import { useState } from 'react'
import { PlusIcon, XIcon } from 'lucide-react'
import { useLinkCandidates, useRecordRefs } from '@/lib/api/hooks/use-privacy'
import type { RecordRef, RecordType } from '@/lib/api/types'
import { RECORD_LABELS } from '@/lib/links'
import { useDebouncedValue } from '@/lib/utils/use-debounced-value'
import { useOrgSlug } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/**
 * Searchable list of records of one type (ID + title). Used inside RecordPicker
 * and the LinkedRecords "Link existing" dialog.
 */
export function RecordSearchList({
  type,
  forRecord = null,
  exclude = [],
  onSelect,
  autoFocus,
}: {
  type: RecordType
  /** Leaves out records already linked to this one. */
  forRecord?: { type: RecordType; id: string } | null
  exclude?: string[]
  onSelect: (ref: RecordRef) => void
  autoFocus?: boolean
}) {
  const org = useOrgSlug()
  const [q, setQ] = useState('')
  const debounced = useDebouncedValue(q, 200)
  const { data = [], isLoading } = useLinkCandidates(org, type, forRecord, debounced, true)
  const items = data.filter((r) => !exclude.includes(r.id))
  const noun = RECORD_LABELS[type].many.toLowerCase()
  return (
    <Command shouldFilter={false}>
      <CommandInput
        value={q}
        onValueChange={setQ}
        placeholder={`Search ${noun} by ID or title…`}
        autoFocus={autoFocus}
      />
      <CommandList>
        <CommandEmpty>{isLoading ? 'Loading…' : `No ${noun} to link.`}</CommandEmpty>
        <CommandGroup>
          {items.map((r) => (
            <CommandItem key={r.id} value={r.id} onSelect={() => onSelect(r)}>
              {r.ref ? <IdChip>{r.ref}</IdChip> : null}
              <span className="truncate">{r.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

/**
 * Pick several records of one type for a form field (e.g. the processing records a
 * request concerns). Holds IDs; shows the chosen records as removable chips.
 */
export function RecordMultiPicker({
  type,
  value,
  onChange,
  id,
  addLabel,
  'aria-describedby': describedBy,
}: {
  type: RecordType
  value: string[]
  onChange: (ids: string[]) => void
  id?: string
  addLabel?: string
  'aria-describedby'?: string
}) {
  const org = useOrgSlug()
  const [open, setOpen] = useState(false)
  // Refs picked in this session, so new chips render before the lookup refetches.
  const [picked, setPicked] = useState<RecordRef[]>([])
  const { data: resolved = [] } = useRecordRefs(org, type, value)
  const refs = value.map(
    (v) =>
      resolved.find((r) => r.id === v) ??
      picked.find((r) => r.id === v) ?? { id: v, ref: null, title: 'Loading…' },
  )
  return (
    <div className="flex flex-col gap-2">
      {refs.length ? (
        <ul
          className="flex flex-wrap gap-1.5"
          aria-label={`Chosen ${RECORD_LABELS[type].many.toLowerCase()}`}
        >
          {refs.map((r) => (
            <li
              key={r.id}
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-surface py-0.5 pr-0.5 pl-1.5 text-sm"
            >
              {r.ref ? <IdChip>{r.ref}</IdChip> : null}
              <span className="truncate">{r.title}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== r.id))}
                className="inline-flex size-6 items-center justify-center rounded-sm text-muted hover:bg-surface-2 hover:text-fg"
                aria-label={`Remove ${r.ref ?? r.title}`}
              >
                <XIcon className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="secondary"
            size="sm"
            className="w-fit"
            aria-describedby={describedBy}
          >
            <PlusIcon aria-hidden="true" />
            {addLabel ?? `Add ${RECORD_LABELS[type].one.toLowerCase()}`}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <RecordSearchList
            type={type}
            exclude={value}
            autoFocus
            onSelect={(r) => {
              setPicked((p) => [...p, r])
              onChange([...value, r.id])
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
