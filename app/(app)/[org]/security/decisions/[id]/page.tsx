import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { DecisionPage } from '@/features/security/decision-page'

export const metadata: Metadata = { title: 'Decision' }

export default async function Page({ params }: PageProps<'/[org]/security/decisions/[id]'>) {
  const { id } = await params
  return (
    <ModuleGuard feature="security" permission="security.read">
      <DecisionPage id={id} />
    </ModuleGuard>
  )
}
