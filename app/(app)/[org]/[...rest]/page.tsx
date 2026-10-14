import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { findNavItem } from '@/lib/nav'
import { ModulePlaceholder } from '@/features/shell/module-page'

function subpathOf(rest: string[]): string {
  return `/${rest.map(decodeURIComponent).join('/')}`
}

export async function generateMetadata({
  params,
}: PageProps<'/[org]/[...rest]'>): Promise<Metadata> {
  const { rest } = await params
  return { title: findNavItem(subpathOf(rest))?.item.label ?? 'Not found' }
}

/**
 * Catch-all for module routes not built yet. Specific routes added in later
 * milestones take precedence over this one.
 */
export default async function ModuleRoute({ params }: PageProps<'/[org]/[...rest]'>) {
  const { rest } = await params
  const subpath = subpathOf(rest)
  if (!findNavItem(subpath)) notFound()
  return <ModulePlaceholder subpath={subpath} />
}
