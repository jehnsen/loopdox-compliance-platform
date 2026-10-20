import { syntaxTree } from '@codemirror/language'
import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type Line,
  type TransactionSpec,
} from '@codemirror/state'
import { buildTable, editTable, findTable, type TableAt, type TableOp } from './tables'

/**
 * Editing commands as pure functions of the editor state: each returns the
 * transaction to dispatch, or null when it doesn't apply. The toolbar, keymap
 * and slash commands all go through these.
 */
export type Command = (state: EditorState) => TransactionSpec | null

// ---------------------------------------------------------------------------
// Inline marks: bold, italic, strikethrough, code
// ---------------------------------------------------------------------------

export type InlineMark = 'bold' | 'italic' | 'strike' | 'code'

const MARKS: Record<InlineMark, { token: string; node: string; placeholder: string }> = {
  bold: { token: '**', node: 'StrongEmphasis', placeholder: 'bold text' },
  italic: { token: '_', node: 'Emphasis', placeholder: 'italic text' },
  strike: { token: '~~', node: 'Strikethrough', placeholder: 'struck text' },
  code: { token: '`', node: 'InlineCode', placeholder: 'code' },
}

type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>

/**
 * The nearest syntax node called `name` that strictly contains `pos`. A cursor
 * right after `**bold**` is outside it, so typing there isn't bold.
 */
export function enclosing(state: EditorState, pos: number, name: string): SyntaxNode | null {
  for (const side of [-1, 1] as const) {
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, side)
    while (node) {
      if (node.name === name && node.from < pos && pos < node.to) return node
      node = node.parent
    }
  }
  return null
}

/** Bold/italic/strike/code on or off. Inside an existing span, the whole span is unwrapped. */
export function toggleInline(mark: InlineMark): Command {
  const { token, node: nodeName, placeholder } = MARKS[mark]
  return (state) =>
    state.changeByRange((range) => {
      const node = enclosing(state, range.from, nodeName)
      if (node && node.to >= range.to) {
        const open = node.firstChild
        const close = node.lastChild
        if (open && close && open.from !== close.from) {
          const changes: ChangeSpec[] = [
            { from: open.from, to: open.to, insert: '' },
            { from: close.from, to: close.to, insert: '' },
          ]
          const shift = open.to - open.from
          return {
            changes,
            range: EditorSelection.range(
              Math.max(range.from - shift, open.from),
              Math.max(range.to - shift, open.from),
            ),
          }
        }
      }
      const text = state.sliceDoc(range.from, range.to)
      if (text.length > token.length * 2 && text.startsWith(token) && text.endsWith(token)) {
        const inner = text.slice(token.length, -token.length)
        return {
          changes: { from: range.from, to: range.to, insert: inner },
          range: EditorSelection.range(range.from, range.from + inner.length),
        }
      }
      const content = text || placeholder
      return {
        changes: { from: range.from, to: range.to, insert: `${token}${content}${token}` },
        range: EditorSelection.range(
          range.from + token.length,
          range.from + token.length + content.length,
        ),
      }
    })
}

// ---------------------------------------------------------------------------
// Line formats: headings, lists, quotes, indentation
// ---------------------------------------------------------------------------

const HEADING = /^(\s{0,3})#{1,6}\s+/
const LIST = /^(\s*)(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/
const QUOTE = /^(\s{0,3})>\s?/

export type BlockStyle = 0 | 1 | 2 | 3 | 4
export type ListKind = 'bullet' | 'ordered' | 'task'

/** The lines touched by the selection, each once, in document order. */
export function selectedLines(state: EditorState): Line[] {
  const seen = new Set<number>()
  const lines: Line[] = []
  for (const r of state.selection.ranges) {
    const last = state.doc.lineAt(r.to).number
    for (let n = state.doc.lineAt(r.from).number; n <= last; n++) {
      if (seen.has(n)) continue
      seen.add(n)
      lines.push(state.doc.line(n))
    }
  }
  return lines.sort((a, b) => a.from - b.from)
}

function lineChanges(state: EditorState, edit: (line: Line, i: number) => string | null) {
  const changes: ChangeSpec[] = []
  selectedLines(state).forEach((line, i) => {
    const next = edit(line, i)
    if (next !== null && next !== line.text)
      changes.push({ from: line.from, to: line.to, insert: next })
  })
  if (!changes.length) return null
  // A cursor at the start of a line follows the inserted marker ("## |"), not precedes it.
  const set = state.changes(changes)
  return { changes: set, selection: state.selection.map(set, 1), scrollIntoView: true }
}

/** Heading level of a line (0 = normal text). */
export function headingLevel(text: string): number {
  return /^\s{0,3}(#{1,6})\s/.exec(text)?.[1]?.length ?? 0
}

/** Normal text or a heading level; headings drop any list or quote marker. */
export function setBlockStyle(level: BlockStyle): Command {
  return (state) =>
    lineChanges(state, (line) => {
      const bare = line.text.replace(HEADING, '$1')
      if (level === 0) return bare
      return `${'#'.repeat(level)} ${bare.replace(LIST, '').replace(QUOTE, '').trimStart()}`
    })
}

export function listKind(text: string): ListKind | null {
  if (/^\s*[-*+]\s+\[[ xX]\]\s/.test(text)) return 'task'
  if (/^\s*[-*+]\s/.test(text)) return 'bullet'
  if (/^\s*\d+[.)]\s/.test(text)) return 'ordered'
  return null
}

/** Bulleted, numbered or checklist on or off for the selected lines. Blank lines are skipped. */
export function toggleList(kind: ListKind): Command {
  return (state) => {
    const lines = selectedLines(state)
    const content = lines.length > 1 ? lines.filter((l) => l.text.trim()) : lines
    const allKind = content.every((l) => listKind(l.text) === kind)
    let n = 0
    const targets = new Set(content.map((l) => l.number))
    return lineChanges(state, (line) => {
      if (!targets.has(line.number)) return null
      const m = LIST.exec(line.text)
      const indent = m?.[1] ?? /^\s*/.exec(line.text)?.[0] ?? ''
      const rest = (m ? line.text.slice(m[0].length) : line.text.slice(indent.length))
        .replace(HEADING, '')
        .replace(QUOTE, '')
      if (allKind) return `${indent}${rest}`
      n++
      const marker = kind === 'bullet' ? '- ' : kind === 'task' ? '- [ ] ' : `${n}. `
      return `${indent}${marker}${rest}`
    })
  }
}

export function toggleQuote(): Command {
  return (state) => {
    const lines = selectedLines(state)
    const all = lines.every((l) => QUOTE.test(l.text))
    return lineChanges(state, (line) =>
      all ? line.text.replace(QUOTE, '$1') : `> ${line.text}`.trimEnd() || '>',
    )
  }
}

export function indent(): Command {
  return (state) => lineChanges(state, (line) => (line.text.trim() ? `  ${line.text}` : null))
}

export function outdent(): Command {
  return (state) => lineChanges(state, (line) => line.text.replace(/^( {1,2}|\t)/, ''))
}

// ---------------------------------------------------------------------------
// Blocks: code, divider, tables, arbitrary text
// ---------------------------------------------------------------------------

/**
 * The line a new block goes after: the cursor's line, or the last line of the
 * table or code block the cursor is in, so a block never splits one.
 */
function blockAnchorLine(state: EditorState): Line {
  const head = state.selection.main.head
  const table = tableAt(state)
  if (table) return state.doc.line(table.end + 1)
  // Inclusive of the fence lines themselves, unlike `enclosing`.
  for (const side of [-1, 1] as const) {
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(head, side)
    while (node) {
      if (node.name === 'FencedCode') return state.doc.lineAt(node.to)
      node = node.parent
    }
  }
  return state.doc.lineAt(head)
}

/**
 * Inserts a block on its own lines, separated from neighbouring text by blank
 * lines: below the cursor's line, or in place of an empty line. `select` is an
 * offset range inside `block` to select afterwards; by default the cursor goes
 * to the line after the block.
 */
export function insertBlock(block: string, select?: [number, number]): Command {
  return (state) => {
    const line = blockAnchorLine(state)
    const empty = !line.text.trim()
    const prev = line.number > 1 ? state.doc.line(line.number - 1) : null
    const next = line.number < state.doc.lines ? state.doc.line(line.number + 1) : null
    const from = empty ? line.from : line.to
    // Text directly above "---" or a table changes its meaning, so keep a blank line.
    const lead = empty ? (prev?.text.trim() ? '\n' : '') : '\n\n'
    const trail = next === null || next.text.trim() ? '\n' : ''
    const base = from + lead.length
    const [a, b] = select ?? [block.length + 1, block.length + 1]
    return {
      changes: { from, to: empty ? line.to : from, insert: `${lead}${block}${trail}` },
      selection: EditorSelection.range(base + a, base + b),
      scrollIntoView: true,
    }
  }
}

export function insertCodeBlock(): Command {
  return (state) => {
    const { main } = state.selection
    if (!main.empty) {
      const from = state.doc.lineAt(main.from)
      const to = state.doc.lineAt(main.to)
      const body = state.sliceDoc(from.from, to.to)
      return {
        changes: { from: from.from, to: to.to, insert: `\`\`\`\n${body}\n\`\`\`` },
        selection: EditorSelection.cursor(from.from + 4 + body.length),
      }
    }
    return insertBlock('```\n\n```', [4, 4])(state)
  }
}

export const insertDivider = (): Command => insertBlock('---')

export function insertTable(rows: number, cols: number): Command {
  return insertBlock(buildTable(rows, cols), [2, 2 + 'Column 1'.length])
}

/** Replaces the selection with text, then places the cursor (or a selection) inside it. */
export function insertText(text: string, select?: [number, number]): Command {
  return (state) => {
    const { from, to } = state.selection.main
    const [a, b] = select ?? [text.length, text.length]
    return {
      changes: { from, to, insert: text },
      selection: EditorSelection.range(from + a, from + b),
      scrollIntoView: true,
    }
  }
}

/** Accepts web, mail and in-app links; anything else gets https://. */
export function normalizeUrl(raw: string): string {
  const url = raw.trim()
  if (!url) return ''
  if (/^(https?:|mailto:|\/|#)/i.test(url)) return url
  return `https://${url}`
}

export function insertLink(text: string, url: string): Command {
  const href = normalizeUrl(url)
  const label = text.trim() || href
  return insertText(`[${label}](${href})`)
}

export function insertPageLink(docId: string): Command {
  return insertText(`[[${docId}]]`)
}

/** Strips inline marks and links from the selection (or the cursor's line), and heading/quote markers from its lines. */
export function clearFormatting(): Command {
  return (state) => {
    const strip = (s: string) =>
      s
        .replace(/(?<!!)\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/(\*\*|__|~~)(.+?)\1/g, '$2')
        .replace(/(\*|_)(.+?)\1/g, '$2')
        .replace(/`([^`]+)`/g, '$1')
    const lines = selectedLines(state)
    const { main } = state.selection
    const whole = main.empty
    const changes: ChangeSpec[] = []
    for (const line of lines) {
      const from = whole ? line.from : Math.max(line.from, main.from)
      const to = whole ? line.to : Math.min(line.to, main.to)
      let text = strip(state.sliceDoc(from, to))
      if (from === line.from) text = text.replace(HEADING, '$1').replace(QUOTE, '$1')
      if (text !== state.sliceDoc(from, to)) changes.push({ from, to, insert: text })
    }
    return changes.length ? { changes } : null
  }
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function docLines(state: EditorState): string[] {
  return state.doc.toString().split('\n')
}

/** The table under the cursor, if any (line indexes are 0-based). */
export function tableAt(state: EditorState): TableAt | null {
  const head = state.selection.main.head
  const line = state.doc.lineAt(head)
  return findTable(docLines(state), line.number - 1, head - line.from)
}

export function tableCommand(op: TableOp): Command {
  return (state) => {
    const t = tableAt(state)
    if (!t) return null
    const lines = docLines(state).slice(t.start, t.end + 1)
    const result = editTable(lines, op, t.row, t.col)
    if (!result) return null
    const from = state.doc.line(t.start + 1).from
    const to = state.doc.line(t.end + 1).to
    const insert = result.lines.join('\n')
    const rowStart = result.lines.slice(0, result.row).reduce((n, l) => n + l.length + 1, 0)
    return {
      changes: { from, to, insert },
      selection: EditorSelection.cursor(from + rowStart + 2),
      scrollIntoView: true,
    }
  }
}

// ---------------------------------------------------------------------------
// Checklists and image uploads
// ---------------------------------------------------------------------------

/** Ticks or unticks the checklist item on the line at `pos`. */
export function toggleTaskAt(pos: number): Command {
  return (state) => {
    const line = state.doc.lineAt(pos)
    const m = /^(\s*[-*+]\s+\[)([ xX])\]/.exec(line.text)
    if (!m?.[1]) return null
    const at = line.from + m[1].length
    return { changes: { from: at, to: at + 1, insert: m[2] === ' ' ? 'x' : ' ' } }
  }
}

/** Marker text shown while an image uploads; unique per upload so it can be found again. */
export function uploadPlaceholder(name: string, token: string): string {
  return `![Uploading ${name.replace(/[[\]]/g, '')}… ${token}]()`
}

/** Swaps an upload placeholder for its final text (empty to remove it). */
export function replacePlaceholder(placeholder: string, text: string): Command {
  return (state) => {
    const at = state.doc.toString().indexOf(placeholder)
    if (at < 0) return null
    return { changes: { from: at, to: at + placeholder.length, insert: text } }
  }
}

/** Alt text from a file name: "access-review_q3.png" → "access review q3". */
export function altFromFileName(name: string): string {
  return (
    name
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/[[\]()]/g, '')
      .trim() || 'Image'
  )
}

// ---------------------------------------------------------------------------
// Toolbar state
// ---------------------------------------------------------------------------

export interface FormatState {
  block: BlockStyle | 5 | 6
  bold: boolean
  italic: boolean
  strike: boolean
  code: boolean
  list: ListKind | null
  quote: boolean
  inTable: boolean
  canDeleteRow: boolean
  canDeleteColumn: boolean
}

/** What the toolbar should show as active for the cursor's position. */
export function formatAt(state: EditorState): FormatState {
  const head = state.selection.main.head
  const text = state.doc.lineAt(head).text
  const table = tableAt(state)
  return {
    block: headingLevel(text) as FormatState['block'],
    bold: Boolean(enclosing(state, head, 'StrongEmphasis')),
    italic: Boolean(enclosing(state, head, 'Emphasis')),
    strike: Boolean(enclosing(state, head, 'Strikethrough')),
    code: Boolean(enclosing(state, head, 'InlineCode')),
    list: listKind(text),
    quote: QUOTE.test(text),
    inTable: Boolean(table),
    canDeleteRow: Boolean(table && table.row > 1),
    canDeleteColumn: Boolean(table && table.columns > 1),
  }
}
