import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { KeysPage } from '@/features/ai-governance/keys-page'

export const metadata: Metadata = { title: 'Provider keys' }

export default function Page() {
  return (
    <ModuleGuard feature="aiGovernance" permission="ai.read">
      <KeysPage />
    </ModuleGuard>
  )
}
