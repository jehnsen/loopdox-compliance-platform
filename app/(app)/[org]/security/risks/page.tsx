import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { RiskListPage } from '@/features/security/risk-list-page'

export const metadata: Metadata = { title: 'Risks' }

export default function Page() {
  return (
    <ModuleGuard feature="security" permission="security.read">
      <RiskListPage />
    </ModuleGuard>
  )
}
