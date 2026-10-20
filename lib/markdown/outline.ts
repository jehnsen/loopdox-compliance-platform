import { headingText } from '@/lib/markdown/toc'

export interface OutlineEntry {
  level: number
  text: string
  /** Offset of the heading line's first character in the source. */
  from: number
}

/** Every heading (H1–H6) with its position, skipping fenced code. Used by the editor outline. */
export function headingOutline(markdown: string): OutlineEntry[] {
  const out: OutlineEntry[] = []
  let fence: string | null = null
  let offset = 0
  for (const line of markdown.split('\n')) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (f?.[1]) {
      if (!fence) fence = f[1][0] ?? null
      else if (f[1][0] === fence) fence = null
    } else if (!fence) {
      const h = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line)
      if (h?.[1] && h[2] !== undefined) {
        const text = headingText(h[2])
        if (text) out.push({ level: h[1].length, text, from: offset })
      }
    }
    offset += line.length + 1
  }
  return out
}

/** Words a reader sees: Markdown syntax, URLs and table rules don't count. */
export function countWords(markdown: string): number {
  const text = markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, id: string, label?: string) => label ?? id)
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, ' ')
    .replace(/[#>*_`~|]/g, ' ')
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
}

/** Minutes to read at 200 words a minute, at least 1 when there is any text. */
export function readingMinutes(words: number): number {
  return words ? Math.max(1, Math.round(words / 200)) : 0
}
