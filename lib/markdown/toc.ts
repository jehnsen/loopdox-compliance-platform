import GithubSlugger from 'github-slugger'

export interface TocEntry {
  level: 2 | 3
  text: string
  id: string
}

/** Plain text of a heading line, as rehype-slug will see it after rendering. */
function headingText(raw: string): string {
  return raw
    .replace(/\s+#+\s*$/, '') // closing hashes
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links and images
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, id: string, label?: string) => label ?? id)
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, '$2')
    .trim()
}

/**
 * Headings for "On this page". IDs are computed with the same slugger, in the
 * same order, as rehype-slug, so links match the rendered anchors.
 */
export function extractToc(markdown: string): TocEntry[] {
  const slugger = new GithubSlugger()
  const entries: TocEntry[] = []
  let fence: string | null = null
  for (const line of markdown.split('\n')) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (f?.[1]) {
      if (!fence) fence = f[1][0] ?? null
      else if (f[1][0] === fence) fence = null
      continue
    }
    if (fence) continue
    const h = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line)
    if (!h?.[1] || h[2] === undefined) continue
    const text = headingText(h[2])
    const id = slugger.slug(text)
    const level = h[1].length
    if (level === 2 || level === 3) entries.push({ level, text, id })
  }
  return entries
}
