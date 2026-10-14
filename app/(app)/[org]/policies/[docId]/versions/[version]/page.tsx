import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ModuleGuard } from '@/features/shell/module-page'
import { VersionPage } from '@/features/policies/version-page'

export async function generateMetadata({
  params,
}: PageProps<'/[org]/policies/[docId]/versions/[version]'>): Promise<Metadata> {
  const { version } = await params
  return { title: `Version ${version}` }
}

export default async function Page({
  params,
}: PageProps<'/[org]/policies/[docId]/versions/[version]'>) {
  const { docId, version } = await params
  const n = Number(version)
  if (!Number.isInteger(n) || n < 1) notFound()
  return (
    <ModuleGuard feature="policies" permission="policies.read">
      <VersionPage id={docId} version={n} />
    </ModuleGuard>
  )
}
