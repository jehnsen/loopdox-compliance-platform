import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { AuditPackPage } from '@/features/evidence/audit-pack-page'

export const metadata: Metadata = { title: 'Audit pack' }

export default function Page() {
  return (
    <ModuleGuard feature="evidence" permission="evidence.read">
      <AuditPackPage />
    </ModuleGuard>
  )
}
