import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { ControlPage } from '@/features/evidence/control-page'

export const metadata: Metadata = { title: 'Control' }

export default async function Page({ params }: PageProps<'/[org]/evidence/controls/[controlId]'>) {
  const { controlId } = await params
  return (
    <ModuleGuard feature="evidence" permission="evidence.read">
      <ControlPage id={controlId} />
    </ModuleGuard>
  )
}
