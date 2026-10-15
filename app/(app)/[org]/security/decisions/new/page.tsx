import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { NewDecisionPage } from '@/features/security/decision-page'

export const metadata: Metadata = { title: 'New decision' }

export default function Page() {
  return (
    <ModuleGuard feature="security" permission="security.edit">
      <NewDecisionPage />
    </ModuleGuard>
  )
}
