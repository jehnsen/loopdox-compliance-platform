import * as React from 'react'
import { cn } from '@/lib/utils/cn'

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-20 w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-base text-fg transition-colors placeholder:text-muted hover:border-muted/50 focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-bad',
        className,
      )}
      {...props}
    />
  )
}
