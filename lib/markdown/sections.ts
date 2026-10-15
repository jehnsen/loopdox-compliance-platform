import GithubSlugger from 'github-slugger'
import { headingText } from '@/lib/markdown/toc'

export interface MarkdownSection {
  /** Anchor, identical to the one rehype-slug gives the rendered heading. */
  id: string
  heading: string
  level: number
  /** Paragraphs and list items under this heading (not under a sub-heading), as plain text. */
  passages: string[]
}

/** Markdown inline syntax → plain text: "**MFA** for [[ITD-007]]" → "MFA for ITD-007". */
export function plainText(md: string): string {
  return md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, id: string, label?: string) => label ?? id)
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__|~~)(.+?)\1/g, '$2')
    .replace(/(^|\W)[*_](\S(?:.*?\S)?)[*_](?=\W|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Splits Markdown into heading sections, with the same anchors as the rendered page.
 * Used to cite "ITD-007 › 3.2 Authentication" and link straight to it.
 */
export function splitSections(markdown: string): MarkdownSection[] {
  const slugger = new GithubSlugger()
  const sections: MarkdownSection[] = []
  let current: MarkdownSection = { id: '', heading: '', level: 0, passages: [] }
  let paragraph: string[] = []
  let fence: string | null = null

  const flush = () => {
    if (paragraph.length) current.passages.push(plainText(paragraph.join(' ')))
    paragraph = []
  }

  for (const line of markdown.split('\n')) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (f?.[1]) {
      fence = fence ? (f[1][0] === fence ? null : fence) : (f[1][0] ?? null)
      continue
    }
    if (fence) continue
    const h = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line)
    if (h?.[1] && h[2] !== undefined) {
      flush()
      if (current.heading || current.passages.length) sections.push(current)
      const text = headingText(h[2])
      current = { id: slugger.slug(text), heading: text, level: h[1].length, passages: [] }
      continue
    }
    const item = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/.exec(line)
    if (item?.[1] !== undefined) {
      flush()
      current.passages.push(plainText(item[1]))
      continue
    }
    if (!line.trim() || /^\s*\|/.test(line)) {
      flush()
      continue
    }
    paragraph.push(line.trim())
  }
  flush()
  if (current.heading || current.passages.length) sections.push(current)
  return sections.filter((s) => s.passages.some(Boolean))
}
