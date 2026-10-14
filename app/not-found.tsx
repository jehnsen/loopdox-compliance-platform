import Link from 'next/link'
import { en } from '@/lib/i18n/en'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center"
    >
      <p className="font-mono text-sm text-muted">404</p>
      <h1 className="text-xl font-semibold">{en.states.notFoundTitle}</h1>
      <p className="max-w-md text-base text-muted">{en.states.notFoundBody}</p>
      <Button asChild variant="secondary">
        <Link href="/select-org">Go to your organisations</Link>
      </Button>
    </main>
  )
}
