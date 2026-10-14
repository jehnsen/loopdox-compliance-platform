import type { ReactNode } from 'react'
import { APP_NAME } from '@/lib/config'
import { en } from '@/lib/i18n/en'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-md bg-accent font-mono text-sm font-bold text-accent-fg"
          >
            {APP_NAME.slice(0, 1)}
          </span>
          {APP_NAME}
        </span>
        <p className="text-sm text-muted">{en.app.tagline}</p>
      </div>
      <main id="main" className="w-full max-w-md">
        {children}
      </main>
    </div>
  )
}
