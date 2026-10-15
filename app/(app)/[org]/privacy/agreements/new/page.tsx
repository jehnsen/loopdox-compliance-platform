import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { AgreementForm } from '@/features/privacy/agreement-form'

export const metadata: Metadata = { title: 'New agreement' }

export default function Page() {
  return (
    <ModuleGuard feature="privacy" permission="privacy.edit">
      <AgreementForm />
    </ModuleGuard>
  )
}
