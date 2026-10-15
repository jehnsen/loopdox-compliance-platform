import type { Metadata } from 'next'
import { HydrationBoundary } from '@tanstack/react-query'
import { qk } from '@/lib/api/query-keys'
import { prefetch } from '@/lib/server/prefetch'
import { ModuleGuard } from '@/features/shell/module-page'
import { QuestionnairePage } from '@/features/questionnaires/questionnaire-page'

export const metadata: Metadata = { title: 'Questionnaire' }

export default async function Page({ params }: PageProps<'/[org]/questionnaires/[id]'>) {
  const { org, id } = await params
  const state = await prefetch([
    {
      queryKey: qk.questionnaires.detail(org, id),
      path: `/orgs/${org}/questionnaires/${encodeURIComponent(id)}`,
    },
  ])
  return (
    <HydrationBoundary state={state}>
      <ModuleGuard feature="questionnaires" permission="questionnaires.read">
        <QuestionnairePage id={id} />
      </ModuleGuard>
    </HydrationBoundary>
  )
}
