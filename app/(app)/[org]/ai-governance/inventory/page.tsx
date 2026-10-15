import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { InventoryListPage } from '@/features/ai-governance/inventory-list-page'

export const metadata: Metadata = { title: 'AI inventory' }

export default function Page() {
  return (
    <ModuleGuard feature="aiGovernance" permission="ai.read">
      <InventoryListPage />
    </ModuleGuard>
  )
}
