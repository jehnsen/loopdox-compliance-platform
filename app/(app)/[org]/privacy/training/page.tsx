import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { TrainingPage } from '@/features/privacy/training-page'

export const metadata: Metadata = { title: 'Training' }

export default function Page() {
  return (
    <ModuleGuard feature="privacy" permission="privacy.read">
      <TrainingPage />
    </ModuleGuard>
  )
}
