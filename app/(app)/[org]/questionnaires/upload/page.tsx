import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { QuestionnaireUploadPage } from '@/features/questionnaires/upload-page'

export const metadata: Metadata = { title: 'Upload a questionnaire' }

export default function Page() {
  return (
    <ModuleGuard feature="questionnaires" permission="questionnaires.edit">
      <QuestionnaireUploadPage />
    </ModuleGuard>
  )
}
