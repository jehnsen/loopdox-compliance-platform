import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { AssessmentsListPage } from '@/features/ai-governance/assessments-list-page'

export const metadata: Metadata = { title: 'AI assessments' }

export default function Page() {
  return (
    <ModuleGuard feature="aiGovernance" permission="ai.read">
      <AssessmentsListPage />
    </ModuleGuard>
  )
}
