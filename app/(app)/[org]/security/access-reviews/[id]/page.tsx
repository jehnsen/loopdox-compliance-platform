import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { ReviewPage } from '@/features/security/review-page'

export const metadata: Metadata = { title: 'Access review' }

export default async function Page({ params }: PageProps<'/[org]/security/access-reviews/[id]'>) {
  const { id } = await params
  return (
    <ModuleGuard feature="security" permission="security.read">
      <ReviewPage id={id} />
    </ModuleGuard>
  )
}
