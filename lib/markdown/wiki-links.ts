import type { Emphasis, Link, Parent, PhrasingContent, Root, Text } from 'mdast'
import { visit, SKIP } from 'unist-util-visit'

/** `[[ITD-006]]` or `[[ITD-006|custom label]]`. */
export const WIKI_LINK = /\[\[([A-Za-z][A-Za-z0-9]{1,9}-\d{3,4})(?:\|([^\]]+))?\]\]/g

export interface WikiTarget {
  id: string
  docId: string
  title: string
}

export interface WikiLinkOptions {
  resolve: (docId: string) => WikiTarget | undefined
  href: (target: WikiTarget) => string
}

export const BROKEN_LINK_TITLE = 'No page with this ID yet'

/**
 * Remark plugin: turns [[ID]] into a link to that page, or a styled "broken"
 * span when no page has the ID. A link that is the whole paragraph or list item
 * also shows the title ("ITD-007 Access Control Policy"); inline it shows the ID.
 */
export function remarkWikiLinks(options: WikiLinkOptions) {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent: Parent | undefined) => {
      if (!parent || index === undefined || !node.value.includes('[[')) return
      const value = node.value
      const standalone = parent.children.length === 1 && /^\s*\[\[[^\]]+\]\]\s*$/.test(value)
      const out: PhrasingContent[] = []
      let last = 0
      for (const m of value.matchAll(WIKI_LINK)) {
        const start = m.index
        if (start > last) out.push({ type: 'text', value: value.slice(last, start) })
        const docId = (m[1] ?? '').toUpperCase()
        const custom = m[2]?.trim()
        const target = options.resolve(docId)
        if (target) {
          const link: Link = {
            type: 'link',
            url: options.href(target),
            title: `${target.docId} ${target.title}`,
            children: [{ type: 'text', value: custom ?? (standalone ? `${target.docId} ${target.title}` : target.docId) }],
            data: { hProperties: { className: ['wikilink'] } },
          }
          out.push(link)
        } else {
          const broken: Emphasis = {
            type: 'emphasis',
            children: [{ type: 'text', value: custom ?? docId }],
            data: { hName: 'span', hProperties: { className: ['wikilink-broken'], title: BROKEN_LINK_TITLE } },
          }
          out.push(broken)
        }
        last = start + m[0].length
      }
      if (!out.length) return
      if (last < value.length) out.push({ type: 'text', value: value.slice(last) })
      parent.children.splice(index, 1, ...(out as typeof parent.children))
      return [SKIP, index + out.length]
    })
  }
}

/** Distinct IDs referenced as [[ID]] in a Markdown string. */
export function wikiLinkIds(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(WIKI_LINK)].map((m) => (m[1] ?? '').toUpperCase()))]
}
