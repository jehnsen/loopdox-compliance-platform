'use client'

import { Toaster as Sonner, type ToasterProps } from 'sonner'

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'rounded-lg! border! border-line! bg-surface! text-fg! shadow-pop! font-sans! text-base!',
          description: 'text-muted!',
          error: 'border-l-4! border-l-bad!',
          success: 'border-l-4! border-l-ok!',
        },
      }}
      {...props}
    />
  )
}
