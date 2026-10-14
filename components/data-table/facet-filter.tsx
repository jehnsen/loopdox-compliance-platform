'use client'

import type { ReactNode } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface FacetOption {
  value: string
  label: string
  icon?: ReactNode
}

/** Multi-select filter button for table toolbars. */
export function FacetFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: FacetOption[]
  selected: string[]
  onChange: (values: string[]) => void
}) {
  const count = selected.length
  const summary =
    count === 0
      ? null
      : count === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? '1')
        : `${count} selected`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="md"
          className={cn(count > 0 && 'border-accent/50 bg-accent-soft')}
          aria-label={`Filter by ${label.toLowerCase()}${summary ? `: ${summary}` : ''}`}
        >
          <span>{label}</span>
          {summary ? <span className="font-normal text-muted">: {summary}</span> : null}
          <ChevronDownIcon className="text-muted" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(checked) =>
              onChange(checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))
            }
          >
            {o.icon}
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
        {count ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={false}
              onCheckedChange={() => onChange([])}
              className="text-muted"
            >
              Clear
            </DropdownMenuCheckboxItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
