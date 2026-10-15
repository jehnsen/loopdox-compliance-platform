'use client'

import { useEffect, useRef, useState } from 'react'
import { EyeIcon, EyeOffIcon, LockIcon } from 'lucide-react'
import { useReveal } from '@/lib/api/hooks/use-privacy'
import type { RevealRequest } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { cn } from '@/lib/utils/cn'
import { toastError } from '@/lib/utils/toast-error'
import { useOrgSlug } from '@/components/providers/session-provider'
import { Button } from '@/components/ui/button'

export const REVEAL_SECONDS = 30

/**
 * A masked value (`•••• 4821`) with a Reveal button. The revealed value shows for
 * 30 seconds, then masks again. It lives in component state only.
 */
export function SensitiveValueView({
  masked,
  label,
  canReveal,
  onReveal,
  className,
}: {
  masked: string
  /** What the value is, for screen readers: "requester contact". */
  label: string
  canReveal: boolean
  onReveal: () => Promise<string>
  className?: string
}) {
  const [value, setValue] = useState<string | null>(null)
  const [left, setLeft] = useState(0)
  const [pending, setPending] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const hide = () => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    setValue(null)
    setLeft(0)
  }

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current)
    },
    [],
  )

  const reveal = async () => {
    setPending(true)
    try {
      const v = await onReveal()
      setValue(v)
      setLeft(REVEAL_SECONDS)
      if (timer.current) clearInterval(timer.current)
      const until = Date.now() + REVEAL_SECONDS * 1000
      timer.current = setInterval(() => {
        const remaining = Math.ceil((until - Date.now()) / 1000)
        if (remaining <= 0) hide()
        else setLeft(remaining)
      }, 1000)
    } catch {
      // The caller reports the error.
    } finally {
      setPending(false)
    }
  }

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-2', className)}>
      <span
        className={cn('font-mono text-base', value ? 'text-fg' : 'tracking-wide text-muted')}
        data-testid="sensitive-value"
      >
        {value ?? masked}
      </span>
      {value ? (
        <>
          <Button variant="ghost" size="sm" onClick={hide} aria-label={`Hide ${label}`}>
            <EyeOffIcon aria-hidden="true" /> Hide
          </Button>
          <span className="text-xs text-muted tabular-nums" aria-live="polite">
            Hides in {left} s
          </span>
        </>
      ) : canReveal ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void reveal()}
          disabled={pending}
          aria-label={`Reveal ${label}`}
        >
          <EyeIcon aria-hidden="true" /> {pending ? 'Revealing…' : 'Reveal'}
        </Button>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          <LockIcon className="size-3" aria-hidden="true" />
          Masked
        </span>
      )}
    </span>
  )
}

/** Masked value with a permission-gated, audited reveal through /sensitive/reveal. */
export function SensitiveValue({
  masked,
  label,
  target,
  className,
}: {
  masked: string
  label: string
  target: RevealRequest
  className?: string
}) {
  const org = useOrgSlug()
  const can = useCan()
  const reveal = useReveal(org)
  return (
    <SensitiveValueView
      masked={masked}
      label={label}
      className={className}
      canReveal={can('sensitive.reveal')}
      onReveal={async () => {
        try {
          return (await reveal.mutateAsync(target)).value
        } catch (e) {
          toastError(e, 'Couldn’t reveal this value. Try again.')
          throw e
        }
      }}
    />
  )
}
