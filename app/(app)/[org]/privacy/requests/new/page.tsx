import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { DsrForm } from '@/features/privacy/dsr-form'

export const metadata: Metadata = { title: 'New data subject request' }

export default function Page() {
  return (
    <ModuleGuard feature="privacy" permission="privacy.edit">
      <DsrForm />
    </ModuleGuard>
  )
}
