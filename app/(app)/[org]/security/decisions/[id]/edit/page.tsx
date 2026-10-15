import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { EditDecisionPage } from '@/features/security/decision-page'

export const metadata: Metadata = { title: 'Edit decision' }

export default async function Page({ params }: PageProps<'/[org]/security/decisions/[id]/edit'>) {
  const { id } = await params
  return (
    <ModuleGuard feature="security" permission="security.edit">
      <EditDecisionPage id={id} />
    </ModuleGuard>
  )
}
