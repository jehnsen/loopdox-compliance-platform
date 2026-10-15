'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, type ComponentProps } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import { useDocumentLookup } from '@/lib/api/hooks/use-documents'
import type { Citation, DocumentLookupItem } from '@/lib/api/types'
import { remarkCitations } from '@/lib/markdown/citations'
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
    if (href?.startsWith('#'))
      return (
        <a href={href} {...props}>
          {children}
        </a>
      )
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
 *
 * With `citations` (Ask answers), `[n]` markers render as superscript source links.
 * When the URL's #hash names a heading inside, it scrolls there and highlights it
 * once the content has rendered (Ask citations link to policy sections this way).
 */
export function MarkdownView({
  markdown,
  className,
  lookup,
  citations,
  ...props
}: { markdown: string; lookup?: DocumentLookupItem[]; citations?: Citation[] } & Omit<
  ComponentProps<'div'>,
  'children'
>) {
  const org = useOrgSlug()
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1))
    if (!hash || !container.current) return
    const target = container.current.querySelector<HTMLElement>(`[id="${CSS.escape(hash)}"]`)
    if (!target) return
    target.scrollIntoView({ block: 'start' })
    target.dataset.cited = 'true'
    const t = setTimeout(() => delete target.dataset.cited, 4000)
    return () => clearTimeout(t)
  }, [markdown])
  const needsLookup = !lookup && new RegExp(WIKI_LINK.source).test(markdown)
  const { data: fetched } = useDocumentLookup(org, needsLookup)
  const items = lookup ?? fetched

  const remarkPlugins = useMemo(() => {
    const byId = new Map((items ?? []).map((d) => [d.docId.toUpperCase(), d]))
    return [
      remarkGfm,
      ...(citations ? [[remarkCitations, { citations }]] : []),
      [
        remarkWikiLinks,
        {
          resolve: (docId: string) => byId.get(docId),
          href: (t: { id: string }) => `/${org}/policies/${t.id}`,
        },
      ],
    ] as NonNullable<ComponentProps<typeof ReactMarkdown>['remarkPlugins']>
  }, [items, org, citations])

  return (
    <div ref={container} className={cn('markdown', className)} {...props}>
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
