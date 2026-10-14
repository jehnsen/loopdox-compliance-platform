'use client'

import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorSelection, Prec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  BoldIcon,
  CodeIcon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  SquareSplitHorizontalIcon,
  TableIcon,
} from 'lucide-react'
import type { DocumentLookupItem } from '@/lib/api/types'
import { cn } from '@/lib/utils/cn'
import { MarkdownView } from '@/components/markdown/markdown-view'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export type EditorMode = 'write' | 'split' | 'preview'

export interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  /** Ctrl/⌘ S. */
  onSave?: () => void
  /** Pages offered by the [[ autocomplete and resolved in the preview. */
  lookup?: DocumentLookupItem[]
  label: string
  id?: string
  invalid?: boolean
  describedBy?: string
  minHeight?: number
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function wrap(view: EditorView, before: string, after: string, placeholder: string) {
  view.dispatch(
    view.state.changeByRange((range) => {
      const text = view.state.sliceDoc(range.from, range.to) || placeholder
      const insert = `${before}${text}${after}`
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(
          range.from + before.length,
          range.from + before.length + text.length,
        ),
      }
    }),
  )
  view.focus()
}

/** Toggles a line prefix ("## ", "- ", "> ", "1. ") on every selected line. */
function prefixLines(view: EditorView, prefix: string | ((i: number) => string), pattern: RegExp) {
  const { state } = view
  const changes: { from: number; to?: number; insert: string }[] = []
  const lines = new Set<number>()
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++)
      lines.add(n)
  }
  const all = [...lines].map((n) => state.doc.line(n))
  const allHave = all.every((l) => pattern.test(l.text))
  all.forEach((line, i) => {
    const existing = pattern.exec(line.text)?.[0] ?? ''
    if (allHave) changes.push({ from: line.from, to: line.from + existing.length, insert: '' })
    else
      changes.push({
        from: line.from,
        to: line.from + existing.length,
        insert: typeof prefix === 'string' ? prefix : prefix(i),
      })
  })
  view.dispatch({ changes })
  view.focus()
}

function insertBlock(view: EditorView, block: string) {
  const { state } = view
  const pos = state.selection.main.to
  const line = state.doc.lineAt(pos)
  const lead = line.text.trim() ? '\n\n' : ''
  view.dispatch({
    changes: { from: line.to, insert: `${lead}${block}\n` },
    selection: { anchor: line.to + lead.length },
  })
  view.focus()
}

const TABLE = '| Column | Column |\n| --- | --- |\n| Cell | Cell |'

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const theme = EditorView.theme({
  '&': { backgroundColor: 'var(--surface)', color: 'var(--fg)', fontSize: '14px', height: '100%' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 14px' },
  '.cm-gutters': { display: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--accent-soft) !important',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--surface-2) 50%, transparent)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: '8px',
    boxShadow: 'var(--shadow-pop)',
  },
  '.cm-tooltip-autocomplete > ul > li': { padding: '4px 8px', fontFamily: 'var(--font-sans)' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent-soft)',
    color: 'var(--fg)',
  },
  '.cm-completionDetail': { color: 'var(--muted)', fontStyle: 'normal', marginLeft: '8px' },
  '.cm-placeholder': { color: 'var(--muted)' },
})

const highlight = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: '600', fontSize: '1.15em' },
  { tag: tags.heading2, fontWeight: '600', fontSize: '1.1em' },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontWeight: '600' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--accent)' },
  { tag: tags.quote, color: 'var(--muted)' },
  { tag: tags.monospace, color: 'var(--ok)' },
  // Markup characters (#, *, -, >, list markers) are muted; content stays full contrast.
  { tag: [tags.processingInstruction, tags.contentSeparator], color: 'var(--muted)' },
])

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ToolButton({
  label,
  shortcut,
  onClick,
  children,
}: {
  label: string
  shortcut?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          aria-label={label}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg [&_svg]:size-4"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut ? <span className="ml-2 opacity-70">{shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  )
}

const MODES: { value: EditorMode; label: string }[] = [
  { value: 'write', label: 'Write' },
  { value: 'split', label: 'Split' },
  { value: 'preview', label: 'Preview' },
]

export default function MarkdownEditorImpl({
  value,
  onChange,
  onSave,
  lookup = [],
  label,
  id,
  invalid,
  describedBy,
  minHeight = 420,
}: MarkdownEditorProps) {
  const ref = useRef<ReactCodeMirrorRef>(null)
  const [mode, setMode] = useState<EditorMode>('write')
  const saveRef = useRef(onSave)
  const lookupRef = useRef(lookup)
  useLayoutEffect(() => {
    saveRef.current = onSave
    lookupRef.current = lookup
  }, [onSave, lookup])

  // CodeMirror calls these closures on keypresses and completion requests, never
  // during render, so reading the latest-value refs inside them is safe.
  /* eslint-disable react-hooks/refs */
  const extensions = useMemo(() => {
    const wikiCompletion = (ctx: CompletionContext): CompletionResult | null => {
      const m = ctx.matchBefore(/\[\[[A-Za-z0-9-]*/)
      if (!m) return null
      return {
        from: m.from + 2,
        options: lookupRef.current.map((d) => ({
          label: d.docId,
          detail: d.title,
          apply: `${d.docId}]]`,
          type: 'text',
        })),
        validFor: /^[A-Za-z0-9-]*$/,
      }
    }
    return [
      markdown({ base: markdownLanguage }),
      EditorView.lineWrapping,
      theme,
      syntaxHighlighting(highlight),
      autocompletion({ override: [wikiCompletion], icons: false }),
      EditorView.contentAttributes.of({
        'aria-label': label,
        'aria-multiline': 'true',
        ...(id ? { id } : {}),
        ...(invalid ? { 'aria-invalid': 'true' } : {}),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      }),
      Prec.highest(
        keymap.of([
          { key: 'Mod-s', preventDefault: true, run: () => (saveRef.current?.(), true) },
          { key: 'Mod-b', run: (v) => (wrap(v, '**', '**', 'bold text'), true) },
          { key: 'Mod-i', run: (v) => (wrap(v, '_', '_', 'italic text'), true) },
          { key: 'Mod-k', run: (v) => (wrap(v, '[', '](https://)', 'link text'), true) },
        ]),
      ),
    ]
  }, [label, id, invalid, describedBy])
  /* eslint-enable react-hooks/refs */

  const exec = (fn: (v: EditorView) => void) => {
    const v = ref.current?.view
    if (v) fn(v)
  }

  const showEditor = mode !== 'preview'
  const showPreview = mode !== 'write'

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-surface focus-within:border-accent',
        invalid ? 'border-bad' : 'border-line',
      )}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-surface-2/60 px-2 py-1">
        <div
          role="toolbar"
          aria-label="Formatting"
          className={cn('flex flex-wrap items-center gap-0.5', !showEditor && 'invisible')}
        >
          <ToolButton
            label="Heading 2"
            onClick={() => exec((v) => prefixLines(v, '## ', /^#{1,6}\s/))}
          >
            <Heading2Icon />
          </ToolButton>
          <ToolButton
            label="Heading 3"
            onClick={() => exec((v) => prefixLines(v, '### ', /^#{1,6}\s/))}
          >
            <Heading3Icon />
          </ToolButton>
          <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
          <ToolButton
            label="Bold"
            shortcut="⌘B"
            onClick={() => exec((v) => wrap(v, '**', '**', 'bold text'))}
          >
            <BoldIcon />
          </ToolButton>
          <ToolButton
            label="Italic"
            shortcut="⌘I"
            onClick={() => exec((v) => wrap(v, '_', '_', 'italic text'))}
          >
            <ItalicIcon />
          </ToolButton>
          <ToolButton
            label="Bulleted list"
            onClick={() => exec((v) => prefixLines(v, '- ', /^[-*+]\s/))}
          >
            <ListIcon />
          </ToolButton>
          <ToolButton
            label="Numbered list"
            onClick={() => exec((v) => prefixLines(v, (i) => `${i + 1}. `, /^\d+\.\s/))}
          >
            <ListOrderedIcon />
          </ToolButton>
          <ToolButton label="Quote" onClick={() => exec((v) => prefixLines(v, '> ', /^>\s?/))}>
            <QuoteIcon />
          </ToolButton>
          <ToolButton label="Code" onClick={() => exec((v) => wrap(v, '`', '`', 'code'))}>
            <CodeIcon />
          </ToolButton>
          <ToolButton
            label="Link"
            shortcut="⌘K"
            onClick={() => exec((v) => wrap(v, '[', '](https://)', 'link text'))}
          >
            <LinkIcon />
          </ToolButton>
          <ToolButton
            label="Link to a page: [[ID]]"
            onClick={() => exec((v) => wrap(v, '[[', ']]', 'ITD-000'))}
          >
            <span className="font-mono text-xs font-semibold whitespace-nowrap">[[]]</span>
          </ToolButton>
          <ToolButton label="Table" onClick={() => exec((v) => insertBlock(v, TABLE))}>
            <TableIcon />
          </ToolButton>
        </div>
        <div
          className="ml-auto flex rounded-md border border-line bg-surface p-0.5"
          role="radiogroup"
          aria-label="Editor view"
        >
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={mode === m.value}
              onClick={() => setMode(m.value)}
              className={cn(
                'inline-flex h-6 items-center gap-1 rounded-sm px-2 text-sm text-muted hover:text-fg',
                mode === m.value && 'bg-accent-soft font-medium text-fg',
                m.value === 'split' && 'hidden lg:inline-flex',
              )}
            >
              {m.value === 'split' ? (
                <SquareSplitHorizontalIcon className="size-3.5" aria-hidden="true" />
              ) : null}
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className={cn('grid', mode === 'split' && 'lg:grid-cols-2')} style={{ minHeight }}>
        {showEditor ? (
          <div className={cn('min-w-0', mode === 'split' && 'lg:border-r lg:border-line')}>
            <CodeMirror
              ref={ref}
              value={value}
              onChange={onChange}
              extensions={extensions}
              basicSetup={{
                lineNumbers: false,
                foldGutter: false,
                highlightActiveLineGutter: false,
                autocompletion: false,
              }}
              minHeight={`${minHeight}px`}
              theme="none"
            />
          </div>
        ) : null}
        {showPreview ? (
          <div
            className={cn('min-w-0 overflow-auto px-5 py-4', mode === 'split' && 'max-lg:hidden')}
            aria-label="Preview"
          >
            {value.trim() ? (
              <MarkdownView markdown={value} lookup={lookup} />
            ) : (
              <p className="text-base text-muted">Nothing to preview yet.</p>
            )}
          </div>
        ) : null}
      </div>
      <p className="border-t border-line px-3 py-1.5 text-xs text-muted">
        Markdown. Type <code className="font-mono">[[</code> to link another page.{' '}
        <kbd className="font-mono">⌘S</kbd> saves.
      </p>
    </div>
  )
}
