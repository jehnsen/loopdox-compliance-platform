'use client'

import { useState } from 'react'
import { fromZonedInputValue, toZonedInputValue, tzAbbreviation } from '@/lib/utils/dates'
import { Input } from '@/components/ui/input'

type AriaProps = {
  id?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  'aria-required'?: boolean
}

/**
 * Timezone-aware date input. `mode="date"` holds a calendar date ("2026-10-14");
 * `mode="datetime"` holds an ISO UTC timestamp and shows it as wall-clock time in
 * the tenant's timezone, so "16:00" means 16:00 in Manila whatever the browser's zone.
 */
export function DateField(
  props: AriaProps &
    (
      | {
          mode: 'date'
          value: string | null
          onChange: (v: string) => void
          max?: string
          min?: string
        }
      | {
          mode: 'datetime'
          value: string | null
          onChange: (iso: string) => void
          timezone: string
          /** ISO UTC upper bound, e.g. now. */
          max?: string
        }
    ),
) {
  const {
    id,
    'aria-invalid': invalid,
    'aria-describedby': describedBy,
    'aria-required': required,
  } = props
  const aria = {
    id,
    'aria-invalid': invalid,
    'aria-describedby': describedBy,
    'aria-required': required,
  }
  // Keep partial typing locally; push a value up only when it's complete.
  const zoned =
    props.mode === 'datetime' && props.value ? toZonedInputValue(props.value, props.timezone) : ''
  const [draft, setDraft] = useState<string | null>(null)

  if (props.mode === 'date') {
    return (
      <Input
        type="date"
        value={props.value ?? ''}
        onChange={(e) => props.onChange(e.target.value)}
        max={props.max}
        min={props.min}
        className="w-full sm:w-44"
        {...aria}
      />
    )
  }

  const { timezone } = props
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Input
        type="datetime-local"
        value={draft ?? zoned}
        onChange={(e) => {
          setDraft(e.target.value)
          const iso = fromZonedInputValue(e.target.value, timezone)
          props.onChange(iso ?? '')
          if (iso) setDraft(null)
        }}
        max={props.max ? toZonedInputValue(props.max, timezone) : undefined}
        className="w-full sm:w-56"
        {...aria}
      />
      <span className="text-sm text-muted">
        {timezone} ({tzAbbreviation(props.value || new Date(), timezone)})
      </span>
    </span>
  )
}
