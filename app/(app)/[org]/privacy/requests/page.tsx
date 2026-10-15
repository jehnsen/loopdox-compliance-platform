import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { DsrListPage } from '@/features/privacy/dsr-list-page'

export const metadata: Metadata = { title: 'Data subject requests' }

export default function Page() {
  return (
    <ModuleGuard feature="privacy" permission="privacy.read">
      <DsrListPage />
    </ModuleGuard>
  )
}
