import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { ReviewForm } from '@/features/security/review-form'

export const metadata: Metadata = { title: 'Start an access review' }

export default function Page() {
  return (
    <ModuleGuard feature="security" permission="security.edit">
      <ReviewForm />
    </ModuleGuard>
  )
}
