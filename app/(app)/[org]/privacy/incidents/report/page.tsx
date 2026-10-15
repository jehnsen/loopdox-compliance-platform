import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { ReportIncidentPage } from '@/features/privacy/report-incident-page'

export const metadata: Metadata = { title: 'Report an incident' }

/** Open to every role that can report (staff included), not only privacy readers. */
export default function Page() {
  return (
    <ModuleGuard feature="privacy" permission="incidents.report">
      <ReportIncidentPage />
    </ModuleGuard>
  )
}
