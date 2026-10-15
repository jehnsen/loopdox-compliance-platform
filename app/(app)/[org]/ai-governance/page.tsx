import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { AiOverviewPage } from '@/features/ai-governance/overview-page'

export const metadata: Metadata = { title: 'AI Governance' }

export default function Page() {
  return (
    <ModuleGuard feature="aiGovernance" permission="ai.read">
      <AiOverviewPage />
    </ModuleGuard>
  )
}
