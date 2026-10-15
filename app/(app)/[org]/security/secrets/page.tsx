import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { SecretsPage } from '@/features/security/secrets-page'

export const metadata: Metadata = { title: 'Secrets' }

export default function Page() {
  return (
    <ModuleGuard feature="security" permission="security.read">
      <SecretsPage />
    </ModuleGuard>
  )
}
