import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { ProcessingListPage } from '@/features/privacy/processing-list-page'

export const metadata: Metadata = { title: 'Processing records' }

export default function Page() {
  return (
    <ModuleGuard feature="privacy" permission="privacy.read">
      <ProcessingListPage />
    </ModuleGuard>
  )
}
