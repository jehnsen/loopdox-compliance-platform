'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { FileIcon, FileTextIcon, ListOrderedIcon, type LucideIcon } from 'lucide-react'
import { useOrgSlug } from '@/components/providers/session-provider'
import { PageHeader } from '@/components/page-header'
import { policyPaths } from '@/features/policies/paths'
import { PolicyEditor } from '@/features/policies/policy-editor'
import { TEMPLATES, templateByKey, type TemplateKey } from '@/features/policies/templates'

const ICONS: Record<TemplateKey, LucideIcon> = {
  policy: FileTextIcon,
  procedure: ListOrderedIcon,
  blank: FileIcon,
}

/** Step 1: pick a template. Step 2 (?template=…): the editor, pre-filled. */
export function NewPolicyPage() {
  const org = useOrgSlug()
  const searchParams = useSearchParams()
  const template = templateByKey(searchParams.get('template'))
  const parent = searchParams.get('parent')

  if (template) return <PolicyEditor template={template} defaultParentId={parent} />

  const href = (key: TemplateKey) => {
    const qs = new URLSearchParams({ template: key, ...(parent ? { parent } : {}) })
    return `${policyPaths.new(org)}?${qs}`
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="New page"
        breadcrumbs={[{ label: 'Policies', href: policyPaths.library(org) }, { label: 'New' }]}
        description="Start from a template. You can change everything before saving."
      />
      <ul className="grid gap-3 md:grid-cols-3" aria-label="Templates">
        {TEMPLATES.map((t) => {
          const Icon = ICONS[t.key]
          return (
            <li key={t.key}>
              <Link
                href={href(t.key)}
                className="flex h-full flex-col gap-2 rounded-lg border border-line bg-surface p-5 hover:border-accent/60 hover:bg-accent-soft/40"
              >
                <Icon className="size-6 text-accent" aria-hidden="true" />
                <span className="text-md font-semibold">{t.name}</span>
                <span className="text-base text-muted">{t.description}</span>
                <span className="mt-auto pt-2 text-sm text-muted">
                  {t.requiresApproval
                    ? 'Needs approval before it takes effect'
                    : 'Publishes when saved'}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
