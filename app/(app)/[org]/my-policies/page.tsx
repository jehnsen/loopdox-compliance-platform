import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { MyPoliciesPage } from '@/features/policies/my-policies-page'

export const metadata: Metadata = { title: 'My policies' }

export default function Page() {
  return (
    <ModuleGuard feature="policies" permission="policies.acknowledge">
      <MyPoliciesPage />
    </ModuleGuard>
  )
}
