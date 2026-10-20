import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { syntaxTree } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'

export interface SlashItem {
  label: string
  detail?: string
  /** Extra words the filter matches ("h2", "bullet"). */
  keywords?: string
  /** Runs after the "/query" text has been removed; the cursor is where the slash was. */
  run: (view: EditorView) => void
}

const NO_SLASH = new Set(['InlineCode', 'FencedCode', 'CodeBlock', 'CodeText', 'URL', 'Link'])

/**
 * "/" at the start of a line or after a space opens a menu of blocks to insert.
 * Never inside code, links or URLs, so "https://" and paths type normally.
 */
export function slashCompletion(items: () => SlashItem[]) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const m = ctx.matchBefore(/\/[\w-]*$/)
    if (!m) return null
    const before = m.from > 0 ? ctx.state.sliceDoc(m.from - 1, m.from) : ''
    if (before && !/\s/.test(before)) return null
    let node: ReturnType<ReturnType<typeof syntaxTree>['resolveInner']> | null = syntaxTree(
      ctx.state,
    ).resolveInner(m.from, -1)
    while (node) {
      if (NO_SLASH.has(node.name)) return null
      node = node.parent
    }
    // Filtered here rather than by CodeMirror, so keywords ("h2", "todo") match too.
    const query = m.text.slice(1).toLowerCase()
    const options: Completion[] = items()
      .filter((item) =>
        `${item.label} ${item.keywords ?? ''}`
          .toLowerCase()
          .split(/\s+/)
          .some((word) => word.startsWith(query)),
      )
      .map((item) => ({
        label: item.label,
        detail: item.detail,
        type: 'keyword',
        apply: (view: EditorView, _c: Completion, from: number, to: number) => {
          view.dispatch({ changes: { from: from - 1, to, insert: '' } })
          item.run(view)
        },
      }))
    if (!options.length) return null
    return { from: m.from + 1, options, filter: false }
  }
}
