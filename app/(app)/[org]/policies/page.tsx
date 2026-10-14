import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { PolicyLibraryPage } from '@/features/policies/library-page'

export const metadata: Metadata = { title: 'Policy library' }

export default function Page() {
  return (
    <ModuleGuard feature="policies" permission="policies.read">
      <PolicyLibraryPage />
    </ModuleGuard>
  )
}
