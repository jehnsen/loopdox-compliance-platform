import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { SystemPage } from '@/features/security/system-page'

export const metadata: Metadata = { title: 'System' }

export default async function Page({ params }: PageProps<'/[org]/security/assets/[id]'>) {
  const { id } = await params
  return (
    <ModuleGuard feature="security" permission="security.read">
      <SystemPage id={id} />
    </ModuleGuard>
  )
}
