import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { ProcessingForm } from '@/features/privacy/processing-form'

export const metadata: Metadata = { title: 'New processing record' }

export default function Page() {
  return (
    <ModuleGuard feature="privacy" permission="privacy.edit">
      <ProcessingForm />
    </ModuleGuard>
  )
}
