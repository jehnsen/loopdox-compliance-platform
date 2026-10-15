import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { QuestionnaireListPage } from '@/features/questionnaires/list-page'

export const metadata: Metadata = { title: 'Questionnaires' }

export default function Page() {
  return (
    <ModuleGuard feature="questionnaires" permission="questionnaires.read">
      <QuestionnaireListPage />
    </ModuleGuard>
  )
}
