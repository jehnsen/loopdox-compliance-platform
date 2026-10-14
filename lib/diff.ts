import { diffLines, diffWordsWithSpace } from 'diff'

export type LineKind = 'same' | 'add' | 'del'

export interface DiffLine {
  kind: LineKind
  text: string
  /** Line number in the old text (same/del). */
  oldNo: number | null
  /** Line number in the new text (same/add). */
  newNo: number | null
}

export interface DiffStats {
  added: number
  removed: number
}

function splitLines(value: string): string[] {
  const lines = value.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

/** Line-by-line diff of two texts. */
export function lineDiff(oldText: string, newText: string): DiffLine[] {
  const out: DiffLine[] = []
  let o = 1
  let n = 1
  // A missing final newline shouldn't make the last line look changed.
  const norm = (t: string) => (t === '' || t.endsWith('\n') ? t : `${t}\n`)
  for (const part of diffLines(norm(oldText), norm(newText))) {
    for (const text of splitLines(part.value)) {
      if (part.added) out.push({ kind: 'add', text, oldNo: null, newNo: n++ })
      else if (part.removed) out.push({ kind: 'del', text, oldNo: o++, newNo: null })
      else out.push({ kind: 'same', text, oldNo: o++, newNo: n++ })
    }
  }
  return out
}

export function diffStats(lines: DiffLine[]): DiffStats {
  return {
    added: lines.filter((l) => l.kind === 'add').length,
    removed: lines.filter((l) => l.kind === 'del').length,
  }
}

export type Segment = { text: string; changed: boolean }

/** Word-level segments for a removed/added line pair. */
export function wordSegments(oldLine: string, newLine: string): { old: Segment[]; new: Segment[] } {
  const oldSegs: Segment[] = []
  const newSegs: Segment[] = []
  for (const part of diffWordsWithSpace(oldLine, newLine)) {
    if (part.added) newSegs.push({ text: part.value, changed: true })
    else if (part.removed) oldSegs.push({ text: part.value, changed: true })
    else {
      oldSegs.push({ text: part.value, changed: false })
      newSegs.push({ text: part.value, changed: false })
    }
  }
  return { old: oldSegs, new: newSegs }
}

export type Block =
  | { type: 'lines'; lines: DiffLine[] }
  /** A run of unchanged lines hidden behind "Show N lines". */
  | { type: 'collapsed'; id: string; lines: DiffLine[] }

/**
 * Groups lines into visible blocks and collapsible unchanged runs, keeping
 * `context` unchanged lines around each change.
 */
export function collapseUnchanged(lines: DiffLine[], context = 3, minCollapse = 4): Block[] {
  const blocks: Block[] = []
  let i = 0
  let buffer: DiffLine[] = []
  const flush = () => {
    if (buffer.length) blocks.push({ type: 'lines', lines: buffer })
    buffer = []
  }
  while (i < lines.length) {
    const line = lines[i]
    if (!line || line.kind !== 'same') {
      if (line) buffer.push(line)
      i++
      continue
    }
    let j = i
    while (j < lines.length && lines[j]?.kind === 'same') j++
    const run = lines.slice(i, j)
    const atStart = i === 0
    const atEnd = j === lines.length
    const keepBefore = atStart ? 0 : context
    const keepAfter = atEnd ? 0 : context
    if (run.length - keepBefore - keepAfter >= minCollapse) {
      buffer.push(...run.slice(0, keepBefore))
      flush()
      const hidden = run.slice(keepBefore, run.length - keepAfter)
      blocks.push({ type: 'collapsed', id: `c${i}`, lines: hidden })
      buffer.push(...run.slice(run.length - keepAfter))
    } else {
      buffer.push(...run)
    }
    i = j
  }
  flush()
  return blocks
}

export interface SplitRow {
  left: DiffLine | null
  right: DiffLine | null
}

/** Pairs removed and added lines for side-by-side display. */
export function toSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line) break
    if (line.kind === 'same') {
      rows.push({ left: line, right: line })
      i++
      continue
    }
    const dels: DiffLine[] = []
    const adds: DiffLine[] = []
    while (lines[i]?.kind === 'del') dels.push(lines[i++] as DiffLine)
    while (lines[i]?.kind === 'add') adds.push(lines[i++] as DiffLine)
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) {
      rows.push({ left: dels[k] ?? null, right: adds[k] ?? null })
    }
  }
  return rows
}
