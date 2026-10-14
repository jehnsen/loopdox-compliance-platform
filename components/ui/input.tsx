import * as React from 'react'
import { cn } from '@/lib/utils/cn'

export const inputClass =
  'h-8 w-full min-w-0 rounded-md border border-line bg-surface px-2.5 text-base text-fg placeholder:text-muted/80 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-bad focus-visible:border-accent file:mr-2 file:border-0 file:bg-transparent file:text-sm file:font-medium'

export function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return <input data-slot="input" type={type} className={cn(inputClass, className)} {...props} />
}
