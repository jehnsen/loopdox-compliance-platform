import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { AccessPage } from '@/features/security/access-page'

export const metadata: Metadata = { title: 'Access grants' }

export default function Page() {
  return (
    <ModuleGuard feature="security" permission="security.read">
      <AccessPage />
    </ModuleGuard>
  )
}
