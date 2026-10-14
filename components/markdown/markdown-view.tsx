'use client'

import Link from 'next/link'
import { useMemo, type ComponentProps } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import { useDocumentLookup } from '@/lib/api/hooks/use-documents'
import type { DocumentLookupItem } from '@/lib/api/types'
import { markdownSchema } from '@/lib/markdown/sanitize'
import { remarkWikiLinks, WIKI_LINK } from '@/lib/markdown/wiki-links'
import { cn } from '@/lib/utils/cn'
import { useOrgSlug } from '@/components/providers/session-provider'

const components: Components = {
  a: ({ href, children, node: _node, ...props }) => {
    if (href?.startsWith('/')) {
      return (
        <Link href={href} {...props}>
          {children}
        </Link>
      )
    }
    if (href?.startsWith('#')) return <a href={href} {...props}>{children}</a>
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    )
  },
  table: ({ node: _node, ...props }) => (
    <div className="table-wrap">
      <table {...props} />
    </div>
  ),
}

/**
 * Renders user Markdown safely: GFM tables, heading anchors, and [[ID]] links
 * to other policies. Raw HTML is never rendered.
 */
export function MarkdownView({
  markdown,
  className,
  lookup,
  ...props
}: { markdown: string; lookup?: DocumentLookupItem[] } & Omit<ComponentProps<'div'>, 'children'>) {
  const org = useOrgSlug()
  const needsLookup = !lookup && new RegExp(WIKI_LINK.source).test(markdown)
  const { data: fetched } = useDocumentLookup(org, needsLookup)
  const items = lookup ?? fetched

  const remarkPlugins = useMemo(() => {
    const byId = new Map((items ?? []).map((d) => [d.docId.toUpperCase(), d]))
    return [
      remarkGfm,
      [
        remarkWikiLinks,
        {
          resolve: (docId: string) => byId.get(docId),
          href: (t: { id: string }) => `/${org}/policies/${t.id}`,
        },
      ],
    ] as NonNullable<ComponentProps<typeof ReactMarkdown>['remarkPlugins']>
  }, [items, org])

  return (
    <div className={cn('markdown', className)} {...props}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={[[rehypeSanitize, markdownSchema], rehypeSlug]}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
