import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { EditSystemPage } from '@/features/security/system-page'

export const metadata: Metadata = { title: 'Edit system' }

export default async function Page({ params }: PageProps<'/[org]/security/assets/[id]/edit'>) {
  const { id } = await params
  return (
    <ModuleGuard feature="security" permission="security.edit">
      <EditSystemPage id={id} />
    </ModuleGuard>
  )
}
