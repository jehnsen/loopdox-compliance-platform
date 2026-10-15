import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { ProfilesPage } from '@/features/ai-governance/profiles-page'

export const metadata: Metadata = { title: 'Policy profiles' }

export default function Page() {
  return (
    <ModuleGuard feature="aiGovernance" permission="ai.read">
      <ProfilesPage />
    </ModuleGuard>
  )
}
