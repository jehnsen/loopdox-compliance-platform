import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { EditRiskPage } from '@/features/security/risk-page'

export const metadata: Metadata = { title: 'Edit risk' }

export default async function Page({ params }: PageProps<'/[org]/security/risks/[id]/edit'>) {
  const { id } = await params
  return (
    <ModuleGuard feature="security" permission="security.edit">
      <EditRiskPage id={id} />
    </ModuleGuard>
  )
}
