import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { AssessmentPage } from '@/features/ai-governance/assessment-page'

export const metadata: Metadata = { title: 'AI assessment' }

export default async function Page({ params }: PageProps<'/[org]/ai-governance/assessments/[id]'>) {
  const { id } = await params
  return (
    <ModuleGuard feature="aiGovernance" permission="ai.read">
      <AssessmentPage id={id} />
    </ModuleGuard>
  )
}
