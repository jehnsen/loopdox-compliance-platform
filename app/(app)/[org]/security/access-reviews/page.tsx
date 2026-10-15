import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { ReviewListPage } from '@/features/security/review-list-page'

export const metadata: Metadata = { title: 'Access reviews' }

export default function Page() {
  return (
    <ModuleGuard feature="security" permission="security.read">
      <ReviewListPage />
    </ModuleGuard>
  )
}
