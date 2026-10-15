import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { SystemListPage } from '@/features/security/system-list-page'

export const metadata: Metadata = { title: 'Systems' }

export default function Page() {
  return (
    <ModuleGuard feature="security" permission="security.read">
      <SystemListPage />
    </ModuleGuard>
  )
}
