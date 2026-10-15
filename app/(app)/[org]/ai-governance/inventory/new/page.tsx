import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { UseCaseForm } from '@/features/ai-governance/use-case-form'

export const metadata: Metadata = { title: 'New AI use case' }

export default function Page() {
  return (
    <ModuleGuard feature="aiGovernance" permission="ai.edit">
      <UseCaseForm />
    </ModuleGuard>
  )
}
