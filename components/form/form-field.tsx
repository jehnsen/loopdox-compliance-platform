'use client'

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'
import { Label } from '@/components/ui/label'

/**
 * Label + control + hint + error, wired for screen readers. The single child
 * control receives id, aria-invalid and aria-describedby.
 */
export function FormField({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string
  required?: boolean
  className?: string
  children: ReactElement<Record<string, unknown>>
}) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
      })
    : children
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="text-bad" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </Label>
      {control}
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-bad">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Form-level error banner. */
export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-base text-fg"
    >
      {message}
    </p>
  )
}

/** Applies a 400 response's `fields` map onto react-hook-form errors. */
export function applyFieldErrors<T extends string>(
  fields: Record<string, string> | undefined,
  setError: (name: T, error: { type: string; message: string }) => void,
): boolean {
  if (!fields) return false
  for (const [name, message] of Object.entries(fields))
    setError(name as T, { type: 'server', message })
  return Object.keys(fields).length > 0
}
