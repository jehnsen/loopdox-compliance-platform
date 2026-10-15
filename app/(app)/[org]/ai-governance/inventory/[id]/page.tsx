import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { UseCasePage } from '@/features/ai-governance/use-case-page'

export const metadata: Metadata = { title: 'AI use case' }

export default async function Page({ params }: PageProps<'/[org]/ai-governance/inventory/[id]'>) {
  const { id } = await params
  return (
    <ModuleGuard feature="aiGovernance" permission="ai.read">
      <UseCasePage id={id} />
    </ModuleGuard>
  )
}
