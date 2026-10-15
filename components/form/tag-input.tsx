'use client'

import { useState, type KeyboardEvent } from 'react'
import { XIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { inputClass } from '@/components/ui/input'

/** Free-text tags: Enter or comma adds one, Backspace on an empty box removes the last. */
export function TagInput({
  value,
  onChange,
  id,
  placeholder = 'Type and press Enter',
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  'aria-required': ariaRequired,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  id?: string
  placeholder?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  'aria-required'?: boolean
}) {
  const [draft, setDraft] = useState('')

  const commit = () => {
    const tags = draft
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t && !value.some((v) => v.toLowerCase() === t.toLowerCase()))
    if (tags.length) onChange([...value, ...tags])
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {value.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <li
              key={tag}
              className="inline-flex items-center gap-1 rounded-md bg-surface-2 py-0.5 pr-0.5 pl-2 text-sm"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== tag))}
                className="inline-flex size-5 items-center justify-center rounded-sm text-muted hover:bg-line hover:text-fg"
                aria-label={`Remove ${tag}`}
              >
                <XIcon className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={placeholder}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        aria-required={ariaRequired}
        autoComplete="off"
        className={cn(inputClass)}
      />
    </div>
  )
}
