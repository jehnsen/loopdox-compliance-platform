import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { ConnectorsPage } from '@/features/evidence/connectors-page'

export const metadata: Metadata = { title: 'Connectors' }

export default function Page() {
  return (
    <ModuleGuard feature="evidence" permission="evidence.read">
      <ConnectorsPage />
    </ModuleGuard>
  )
}
