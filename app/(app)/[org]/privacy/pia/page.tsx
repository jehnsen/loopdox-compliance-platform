import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { PiaListPage } from '@/features/privacy/pia-list-page'

export const metadata: Metadata = { title: 'Impact assessments' }

export default function Page() {
  return (
    <ModuleGuard feature="privacy" permission="privacy.read">
      <PiaListPage />
    </ModuleGuard>
  )
}
