import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { EditPolicyPage } from '@/features/policies/edit-policy-page'

export const metadata: Metadata = { title: 'Edit policy' }

export default async function Page({ params }: PageProps<'/[org]/policies/[docId]/edit'>) {
  const { docId } = await params
  return (
    <ModuleGuard feature="policies" permission="policies.edit">
      <EditPolicyPage id={docId} />
    </ModuleGuard>
  )
}
