import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { ControlsPage } from '@/features/evidence/controls-page'

export const metadata: Metadata = { title: 'Controls' }

export default function Page() {
  return (
    <ModuleGuard feature="evidence" permission="evidence.read">
      <ControlsPage />
    </ModuleGuard>
  )
}
