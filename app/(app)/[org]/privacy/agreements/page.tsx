import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { AgreementListPage } from '@/features/privacy/agreement-list-page'

export const metadata: Metadata = { title: 'Agreements' }

export default function Page() {
  return (
    <ModuleGuard feature="privacy" permission="privacy.read">
      <AgreementListPage />
    </ModuleGuard>
  )
}
