import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { IncidentListPage } from '@/features/privacy/incident-list-page'

export const metadata: Metadata = { title: 'Incidents and breaches' }

export default function Page() {
  return (
    <ModuleGuard feature="privacy" permission="privacy.read">
      <IncidentListPage />
    </ModuleGuard>
  )
}
