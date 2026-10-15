import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { EventsPage } from '@/features/ai-governance/events-page'

export const metadata: Metadata = { title: 'AI events' }

export default function Page() {
  return (
    <ModuleGuard feature="aiGovernance" permission="ai.read">
      <EventsPage />
    </ModuleGuard>
  )
}
