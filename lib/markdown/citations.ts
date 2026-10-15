import type { Emphasis, Link, Parent, PhrasingContent, Root, Text } from 'mdast'
import { SKIP, visit } from 'unist-util-visit'
import type { Citation } from '@/lib/api/types'

const MARKER = /\[(\d{1,2})\]/g

/**
 * Remark plugin for Ask answers: each `[n]` becomes a superscript link to citation n.
 * A marker whose citation hasn't arrived yet (still streaming) shows as a plain [n].
 */
export function remarkCitations({ citations }: { citations: Citation[] }) {
  const byN = new Map(citations.map((c) => [c.n, c]))
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent: Parent | undefined) => {
      if (!parent || index === undefined || !MARKER.test(node.value)) return
      MARKER.lastIndex = 0
      const out: PhrasingContent[] = []
      let last = 0
      for (const m of node.value.matchAll(MARKER)) {
        const before = node.value.slice(last, m.index).replace(/\s+$/, '')
        if (before) out.push({ type: 'text', value: before })
        const n = Number(m[1])
        const c = byN.get(n)
        const sup: Emphasis = {
          type: 'emphasis',
          data: {
            hName: 'sup',
            hProperties: { className: [c ? 'citation-ref' : 'citation-pending'] },
          },
          children: c
            ? [
                {
                  type: 'link',
                  url: c.href,
                  title: c.label,
                  data: {
                    hProperties: {
                      className: ['citation-link'],
                      ariaLabel: `Source ${n}: ${c.label}`,
                    },
                  },
                  children: [{ type: 'text', value: String(n) }],
                } satisfies Link,
              ]
            : [{ type: 'text', value: String(n) }],
        }
        out.push(sup)
        last = m.index + m[0].length
      }
      if (last < node.value.length) out.push({ type: 'text', value: node.value.slice(last) })
      parent.children.splice(index, 1, ...(out as typeof parent.children))
      return [SKIP, index + out.length]
    })
  }
}
