import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { EditProcessingPage } from '@/features/privacy/processing-page'

export const metadata: Metadata = { title: 'Edit processing record' }

export default async function Page({ params }: PageProps<'/[org]/privacy/processing/[id]/edit'>) {
  const { id } = await params
  return (
    <ModuleGuard feature="privacy" permission="privacy.edit">
      <EditProcessingPage id={id} />
    </ModuleGuard>
  )
}
