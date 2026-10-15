import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { AskPage } from '@/features/ask/ask-page'

export const metadata: Metadata = { title: 'Ask' }

export default function Page() {
  return (
    <ModuleGuard feature="ask.policy" permission="ask.use">
      <AskPage initialThreadId={null} />
    </ModuleGuard>
  )
}
