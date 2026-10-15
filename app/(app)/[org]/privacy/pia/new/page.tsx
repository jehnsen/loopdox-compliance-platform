import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { NewPiaPage } from '@/features/privacy/pia-page'

export const metadata: Metadata = { title: 'New impact assessment' }

export default function Page() {
  return (
    <ModuleGuard feature="privacy" permission="privacy.edit">
      <NewPiaPage />
    </ModuleGuard>
  )
}
