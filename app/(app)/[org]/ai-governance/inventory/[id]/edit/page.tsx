import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { EditUseCasePage } from '@/features/ai-governance/use-case-page'

export const metadata: Metadata = { title: 'Edit AI use case' }

export default async function Page({
  params,
}: PageProps<'/[org]/ai-governance/inventory/[id]/edit'>) {
  const { id } = await params
  return (
    <ModuleGuard feature="aiGovernance" permission="ai.edit">
      <EditUseCasePage id={id} />
    </ModuleGuard>
  )
}
