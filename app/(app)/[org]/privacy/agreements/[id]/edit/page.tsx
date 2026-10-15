import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { EditAgreementPage } from '@/features/privacy/agreement-page'

export const metadata: Metadata = { title: 'Edit agreement' }

export default async function Page({ params }: PageProps<'/[org]/privacy/agreements/[id]/edit'>) {
  const { id } = await params
  return (
    <ModuleGuard feature="privacy" permission="privacy.edit">
      <EditAgreementPage id={id} />
    </ModuleGuard>
  )
}
