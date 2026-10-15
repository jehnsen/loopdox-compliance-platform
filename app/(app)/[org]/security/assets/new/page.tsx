import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { SystemForm } from '@/features/security/system-form'

export const metadata: Metadata = { title: 'New system' }

export default function Page() {
  return (
    <ModuleGuard feature="security" permission="security.edit">
      <SystemForm />
    </ModuleGuard>
  )
}
