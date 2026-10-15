'use client'

import { useState } from 'react'
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react'
import { useMembers } from '@/lib/api/hooks/use-members'
import type { Member } from '@/lib/api/types'
import { ROLE_LABELS } from '@/lib/auth/permissions'
import { cn } from '@/lib/utils/cn'
import { initials } from '@/lib/utils/format'
import { useOrgSlug } from '@/components/providers/session-provider'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/** Searches the org's members. Auditor guests are excluded by default. */
export function PeoplePicker({
  value,
  onChange,
  id,
  placeholder = 'Choose a person',
  filter = (m) => !m.roles.every((r) => r === 'auditor'),
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: {
  value: string | null
  onChange: (userId: string) => void
  id?: string
  placeholder?: string
  filter?: (m: Member) => boolean
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}) {
  const org = useOrgSlug()
  const [open, setOpen] = useState(false)
  const { data: members = [], isLoading } = useMembers(org)
  const options = members.filter(filter)
  const selected = members.find((m) => m.userId === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className="flex h-8 w-full items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-left text-base aria-invalid:border-bad"
        >
          {selected ? (
            <>
              <span
                aria-hidden="true"
                className="flex size-5 items-center justify-center rounded-full bg-accent-soft text-2xs font-semibold text-accent"
              >
                {initials(selected.name)}
              </span>
              <span className="truncate">{selected.name}</span>
            </>
          ) : (
            <span className="text-muted">{isLoading ? 'Loading people…' : placeholder}</span>
          )}
          <ChevronsUpDownIcon className="ml-auto size-4 shrink-0 text-muted" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search people…" />
          <CommandList>
            <CommandEmpty>No one matches.</CommandEmpty>
            <CommandGroup>
              {options.map((m) => (
                <CommandItem
                  key={m.userId}
                  value={`${m.name} ${m.email} ${m.title ?? ''}`}
                  onSelect={() => {
                    onChange(m.userId)
                    setOpen(false)
                  }}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{m.name}</span>
                    <span className="truncate text-xs text-muted">
                      {m.title ?? m.roles.map((r) => ROLE_LABELS[r]).join(', ')}
                    </span>
                  </span>
                  <CheckIcon
                    className={cn(
                      'ml-auto text-accent!',
                      m.userId === value ? 'opacity-100' : 'opacity-0',
                    )}
                    aria-hidden="true"
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
