import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { ChangesPage } from '@/features/security/changes-page'

export const metadata: Metadata = { title: 'Changes' }

export default function Page() {
  return (
    <ModuleGuard feature="security" permission="security.read">
      <ChangesPage />
    </ModuleGuard>
  )
}
