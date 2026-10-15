import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { UploadsPage } from '@/features/evidence/uploads-page'

export const metadata: Metadata = { title: 'Uploads' }

export default function Page() {
  return (
    <ModuleGuard feature="evidence" permission="evidence.read">
      <UploadsPage />
    </ModuleGuard>
  )
}
