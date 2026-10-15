import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { RiskPage } from '@/features/security/risk-page'

export const metadata: Metadata = { title: 'Risk' }

export default async function Page({ params }: PageProps<'/[org]/security/risks/[id]'>) {
  const { id } = await params
  return (
    <ModuleGuard feature="security" permission="security.read">
      <RiskPage id={id} />
    </ModuleGuard>
  )
}
