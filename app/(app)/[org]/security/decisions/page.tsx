import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { DecisionListPage } from '@/features/security/decision-list-page'

export const metadata: Metadata = { title: 'Decisions' }

export default function Page() {
  return (
    <ModuleGuard feature="security" permission="security.read">
      <DecisionListPage />
    </ModuleGuard>
  )
}
