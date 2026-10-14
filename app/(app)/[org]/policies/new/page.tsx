import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { NewPolicyPage } from '@/features/policies/new-policy-page'

export const metadata: Metadata = { title: 'New page' }

export default function Page() {
  return (
    <ModuleGuard feature="policies" permission="policies.edit">
      <NewPolicyPage />
    </ModuleGuard>
  )
}
