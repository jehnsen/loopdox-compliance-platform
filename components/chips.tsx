import type { ComponentProps } from 'react'
import { SparklesIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/** Mono record ID: ITD-006, DSR-2026-0012, RISK-014. */
export function IdChip({ className, children, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-sm border border-line bg-surface-2 px-1.5 font-mono text-xs font-medium whitespace-nowrap text-fg',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

/** Mono version chip: v4. */
export function VersionChip({
  version,
  className,
  ...props
}: ComponentProps<'span'> & { version: number }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-sm border border-line px-1.5 font-mono text-xs whitespace-nowrap text-muted',
        className,
      )}
      aria-label={`Version ${version}`}
      {...props}
    >
      v{version}
    </span>
  )
}

export function PremiumBadge({
  className,
  label = 'Premium',
}: {
  className?: string
  label?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-4.5 items-center gap-1 rounded-sm border border-premium/30 bg-premium/8 px-1 text-2xs font-semibold tracking-[0.04em] text-premium uppercase',
        className,
      )}
    >
      <SparklesIcon className="size-3" aria-hidden="true" />
      {label}
    </span>
  )
}
