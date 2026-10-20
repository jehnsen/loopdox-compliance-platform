'use client'

import {
  autocompletion,
  startCompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { redo, undo } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { openSearchPanel, search } from '@codemirror/search'
import { Prec, type EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  BoldIcon,
  CodeIcon,
  ImagePlusIcon,
  IndentDecreaseIcon,
  IndentIncreaseIcon,
  ItalicIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  ListTreeIcon,
  Maximize2Icon,
  Minimize2Icon,
  MinusIcon,
  QuoteIcon,
  Redo2Icon,
  RemoveFormattingIcon,
  SearchIcon,
  SquareCodeIcon,
  SquareSplitHorizontalIcon,
  StrikethroughIcon,
  Undo2Icon,
} from 'lucide-react'
import type { DocumentLookupItem } from '@/lib/api/types'
import { IMAGE_ACCEPT_ATTRIBUTE, imageUploadProblem } from '@/lib/files'
import { countWords, headingOutline, readingMinutes } from '@/lib/markdown/outline'
import { cn } from '@/lib/utils/cn'
import { toastError } from '@/lib/utils/toast-error'
import { MarkdownView } from '@/components/markdown/markdown-view'
import {
  altFromFileName,
  clearFormatting,
  formatAt,
  indent,
  insertBlock,
  insertCodeBlock,
  insertDivider,
  insertLink,
  insertPageLink,
  insertTable,
  insertText,
  outdent,
  replacePlaceholder,
  setBlockStyle,
  tableCommand,
  toggleInline,
  toggleList,
  toggleQuote,
  uploadPlaceholder,
  type Command,
  type FormatState,
} from '@/components/markdown/editor/commands'
import { livePreview } from '@/components/markdown/editor/live-preview'
import { slashCompletion, type SlashItem } from '@/components/markdown/editor/slash-commands'
import { baseTheme, livePresentation, sourcePresentation } from '@/components/markdown/editor/theme'
import {
  keyLabel,
  LinkPopover,
  MoreMenu,
  PagePicker,
  StyleMenu,
  TableMenu,
  TablePicker,
  ToolButton,
  ToolDivider,
} from '@/components/markdown/editor/toolbar'

export type EditorMode = 'write' | 'split' | 'preview'

export interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  /** Ctrl/⌘ S. */
  onSave?: () => void
  /** Pages offered by the [[ autocomplete and resolved in the preview. */
  lookup?: DocumentLookupItem[]
  /** Stores an image and returns the URL to write into the Markdown. Hides image tools when absent. */
  onUploadImage?: (file: File) => Promise<{ url: string }>
  label: string
  id?: string
  invalid?: boolean
  describedBy?: string
  minHeight?: number
}

const MODES: { value: EditorMode; label: string }[] = [
  { value: 'write', label: 'Write' },
  { value: 'split', label: 'Split' },
  { value: 'preview', label: 'Preview' },
]

/** The app's sticky top bar (h-14); the editor toolbar sticks just below it. */
const APP_BAR_PX = 56

const SOURCE_PREF = 'loopdox.editor.showMarkdown'

function readSourcePref(): boolean {
  try {
    return localStorage.getItem(SOURCE_PREF) === '1'
  } catch {
    return false
  }
}

const NO_FORMAT: FormatState = {
  block: 0,
  bold: false,
  italic: false,
  strike: false,
  code: false,
  list: null,
  quote: false,
  inTable: false,
  canDeleteRow: false,
  canDeleteColumn: false,
}

const sameFormat = (a: FormatState, b: FormatState) =>
  (Object.keys(a) as (keyof FormatState)[]).every((k) => a[k] === b[k])

/** Runs a command against a view, as a CodeMirror key binding. */
const bind = (cmd: Command) => (view: EditorView) => {
  const spec = cmd(view.state)
  if (spec) view.dispatch(spec)
  return true
}

/** Index of the outline heading the cursor is under, or -1 above the first heading. */
function headingIndexAt(state: EditorState): number {
  const head = state.selection.main.head
  let index = -1
  headingOutline(state.doc.toString()).forEach((e, i) => {
    if (e.from <= head) index = i
  })
  return index
}

const imageFiles = (list: FileList | null | undefined) =>
  [...(list ?? [])].filter((f) => f.type.startsWith('image/'))

export default function MarkdownEditorImpl({
  value,
  onChange,
  onSave,
  lookup = [],
  onUploadImage,
  label,
  id,
  invalid,
  describedBy,
  minHeight = 420,
}: MarkdownEditorProps) {
  const ref = useRef<ReactCodeMirrorRef>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<EditorMode>('write')
  const [source, setSource] = useState(readSourcePref)
  const [format, setFormat] = useState<FormatState>(NO_FORMAT)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [activeHeading, setActiveHeading] = useState(-1)
  const [full, setFull] = useState(false)
  const [link, setLink] = useState({ open: false, text: '' })
  const [uploading, setUploading] = useState(0)
  const [toolbarHeight, setToolbarHeight] = useState(48)
  const stickyTop = (full ? 0 : APP_BAR_PX) + toolbarHeight

  const getView = () => ref.current?.view ?? null
  const focusEditor = () => getView()?.focus()
  const run = (cmd: Command) => {
    const view = getView()
    if (!view) return
    const spec = cmd(view.state)
    if (spec) view.dispatch(spec)
    view.focus()
  }

  const openLink = () => {
    const view = getView()
    const sel = view?.state.selection.main
    const text = view && sel ? view.state.sliceDoc(sel.from, sel.to).split('\n')[0] : ''
    setLink({ open: true, text: text ?? '' })
  }

  /** Inserts a placeholder per image, uploads it, then swaps in the real Markdown. */
  const uploadImages = (files: File[], at?: number) => {
    const view = getView()
    if (!view || !onUploadImage) return
    if (at !== undefined) view.dispatch({ selection: { anchor: at } })
    for (const file of files) {
      const problem = imageUploadProblem(file)
      if (problem) {
        toast.error(problem)
        continue
      }
      const placeholder = uploadPlaceholder(file.name, Math.random().toString(36).slice(2, 8))
      const spec = insertBlock(placeholder)(view.state)
      if (spec) view.dispatch(spec)
      const finish = (text: string) => {
        const current = getView()
        const done = current ? replacePlaceholder(placeholder, text)(current.state) : null
        if (current && done) current.dispatch(done)
        setUploading((n) => n - 1)
      }
      setUploading((n) => n + 1)
      onUploadImage(file).then(
        ({ url }) => finish(`![${altFromFileName(file.name)}](${url})`),
        (e: unknown) => {
          finish('')
          toastError(e, `Couldn’t upload ${file.name}. Try again.`)
        },
      )
    }
    view.focus()
  }

  const slashItems: SlashItem[] = [
    { label: 'Section heading', detail: 'H2', keywords: 'h2 heading', run: bind(setBlockStyle(2)) },
    {
      label: 'Subsection heading',
      detail: 'H3',
      keywords: 'h3 heading',
      run: bind(setBlockStyle(3)),
    },
    { label: 'Minor heading', detail: 'H4', keywords: 'h4 heading', run: bind(setBlockStyle(4)) },
    { label: 'Bulleted list', keywords: 'bullet ul', run: bind(toggleList('bullet')) },
    { label: 'Numbered list', keywords: 'ordered ol number', run: bind(toggleList('ordered')) },
    { label: 'Checklist', keywords: 'todo task checkbox', run: bind(toggleList('task')) },
    { label: 'Quote', keywords: 'blockquote', run: bind(toggleQuote()) },
    { label: 'Code block', keywords: 'pre fence', run: bind(insertCodeBlock()) },
    { label: 'Table', detail: '3 × 3', keywords: 'grid', run: bind(insertTable(3, 3)) },
    { label: 'Divider', keywords: 'hr rule line separator', run: bind(insertDivider()) },
    {
      label: 'Link to a policy',
      detail: '[[ID]]',
      keywords: 'page wiki',
      run: (view) => {
        bind(insertText('[['))(view)
        startCompletion(view)
      },
    },
    { label: 'Link', keywords: 'url web', run: () => openLink() },
    ...(onUploadImage
      ? [
          {
            label: 'Image',
            keywords: 'picture photo upload',
            run: () => fileInput.current?.click(),
          },
        ]
      : []),
  ]

  // CodeMirror calls these from key presses, events and completions, never during
  // render, so the extensions read the latest props and callbacks through refs.
  const latest = useRef({ onSave, lookup, slashItems, uploadImages, openLink, full, outlineOpen })
  const stickyRef = useRef(stickyTop)
  useLayoutEffect(() => {
    latest.current = { onSave, lookup, slashItems, uploadImages, openLink, full, outlineOpen }
    stickyRef.current = stickyTop
  })

  /* eslint-disable react-hooks/refs */
  const extensions = useMemo(() => {
    const wikiCompletion = (ctx: CompletionContext): CompletionResult | null => {
      const m = ctx.matchBefore(/\[\[[A-Za-z0-9-]*/)
      if (!m) return null
      return {
        from: m.from + 2,
        options: latest.current.lookup.map((d) => ({
          label: d.docId,
          detail: d.title,
          apply: `${d.docId}]]`,
          type: 'text',
        })),
        validFor: /^[A-Za-z0-9-]*$/,
      }
    }
    const report = (state: EditorState) => {
      const next = formatAt(state)
      setFormat((prev) => (sameFormat(prev, next) ? prev : next))
      if (latest.current.outlineOpen) setActiveHeading(headingIndexAt(state))
    }
    return [
      markdown({ base: markdownLanguage }),
      EditorView.lineWrapping,
      baseTheme,
      source ? sourcePresentation : [livePresentation, livePreview],
      search({ top: true }),
      autocompletion({
        override: [wikiCompletion, slashCompletion(() => latest.current.slashItems)],
        icons: false,
      }),
      EditorView.contentAttributes.of({
        'aria-label': label,
        'aria-multiline': 'true',
        ...(id ? { id } : {}),
        ...(invalid ? { 'aria-invalid': 'true' } : {}),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      }),
      // Keep the cursor clear of the sticky app bar and toolbar when scrolling to it.
      EditorView.scrollMargins.of(() => ({ top: stickyRef.current + 8, bottom: 32 })),
      EditorView.updateListener.of((u) => {
        if (u.docChanged || u.selectionSet || u.focusChanged) report(u.state)
      }),
      EditorView.domEventHandlers({
        paste(e) {
          const files = imageFiles(e.clipboardData?.files)
          if (!files.length) return false
          e.preventDefault()
          latest.current.uploadImages(files)
          return true
        },
        drop(e, view) {
          const files = imageFiles(e.dataTransfer?.files)
          if (!files.length) return false
          e.preventDefault()
          const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
          latest.current.uploadImages(files, pos ?? undefined)
          return true
        },
      }),
      Prec.highest(
        keymap.of([
          { key: 'Mod-s', preventDefault: true, run: () => (latest.current.onSave?.(), true) },
          { key: 'Mod-b', run: bind(toggleInline('bold')) },
          { key: 'Mod-i', run: bind(toggleInline('italic')) },
          { key: 'Mod-Shift-x', run: bind(toggleInline('strike')) },
          { key: 'Mod-e', run: bind(toggleInline('code')) },
          { key: 'Mod-k', preventDefault: true, run: () => (latest.current.openLink(), true) },
          { key: 'Mod-Alt-0', run: bind(setBlockStyle(0)) },
          { key: 'Mod-Alt-1', run: bind(setBlockStyle(2)) },
          { key: 'Mod-Alt-2', run: bind(setBlockStyle(3)) },
          { key: 'Mod-Alt-3', run: bind(setBlockStyle(4)) },
          { key: 'Mod-Shift-7', run: bind(toggleList('ordered')) },
          { key: 'Mod-Shift-8', run: bind(toggleList('bullet')) },
          { key: 'Mod-Shift-9', run: bind(toggleList('task')) },
          { key: 'Mod-]', run: bind(indent()) },
          { key: 'Mod-[', run: bind(outdent()) },
          { key: 'Mod-\\', run: bind(clearFormatting()) },
          { key: 'Mod-h', preventDefault: true, run: openSearchPanel },
        ]),
      ),
      // Lowest priority: only when nothing else (completion, find panel) used Escape.
      keymap.of([
        {
          key: 'Escape',
          run: () => {
            if (!latest.current.full) return false
            setFull(false)
            return true
          },
        },
      ]),
    ]
  }, [label, id, invalid, describedBy, source])
  /* eslint-enable react-hooks/refs */

  // Track the toolbar's height (it wraps on narrow screens) for the sticky offsets.
  useEffect(() => {
    const el = toolbarRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setToolbarHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Full screen: the page behind stops scrolling.
  useEffect(() => {
    if (!full) return
    const root = document.documentElement
    const before = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = before
    }
  }, [full])

  const toggleSource = () => {
    const next = !source
    setSource(next)
    try {
      localStorage.setItem(SOURCE_PREF, next ? '1' : '0')
    } catch {
      // Storage blocked: the choice lasts until the page reloads.
    }
  }

  const words = useMemo(() => countWords(value), [value])
  const outline = useMemo(() => (outlineOpen ? headingOutline(value) : []), [outlineOpen, value])

  const jumpTo = (from: number) => {
    const view = getView()
    if (!view) return
    view.dispatch({
      selection: { anchor: from },
      effects: EditorView.scrollIntoView(from, { y: 'start', yMargin: 16 }),
    })
    view.focus()
  }

  const showEditor = mode !== 'preview'
  const showPreview = mode !== 'write'
  const showOutline = outlineOpen && showEditor

  return (
    <div
      data-full={full || undefined}
      style={{ ['--md-sticky-top' as string]: `${stickyTop}px` }}
      className={cn(
        'flex flex-col bg-surface',
        full
          ? 'fixed inset-0 z-50 overflow-y-auto'
          : cn(
              'rounded-lg border focus-within:border-accent',
              invalid ? 'border-bad' : 'border-line',
            ),
      )}
    >
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="Editor toolbar"
        className={cn(
          'sticky z-20 flex flex-wrap items-center gap-x-0.5 gap-y-1 border-b border-line bg-surface/95 px-2 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-surface/85',
          full ? 'top-0' : 'top-14 rounded-t-lg',
        )}
      >
        {showEditor ? (
          <>
            <ToolButton
              label="Undo"
              shortcut="Mod-z"
              onClick={() => {
                const view = getView()
                if (view) undo(view)
                view?.focus()
              }}
            >
              <Undo2Icon />
            </ToolButton>
            <ToolButton
              label="Redo"
              shortcut="Mod-Shift-z"
              onClick={() => {
                const view = getView()
                if (view) redo(view)
                view?.focus()
              }}
            >
              <Redo2Icon />
            </ToolButton>
            <ToolDivider />
            <StyleMenu
              value={format.block}
              onPick={(level) => run(setBlockStyle(level))}
              onClose={focusEditor}
            />
            <ToolDivider />
            <ToolButton
              label="Bold"
              shortcut="Mod-b"
              pressed={format.bold}
              onClick={() => run(toggleInline('bold'))}
            >
              <BoldIcon />
            </ToolButton>
            <ToolButton
              label="Italic"
              shortcut="Mod-i"
              pressed={format.italic}
              onClick={() => run(toggleInline('italic'))}
            >
              <ItalicIcon />
            </ToolButton>
            <ToolButton
              label="Strikethrough"
              shortcut="Mod-Shift-x"
              pressed={format.strike}
              onClick={() => run(toggleInline('strike'))}
            >
              <StrikethroughIcon />
            </ToolButton>
            <ToolButton
              label="Inline code"
              shortcut="Mod-e"
              pressed={format.code}
              onClick={() => run(toggleInline('code'))}
            >
              <CodeIcon />
            </ToolButton>
            <ToolDivider />
            <ToolButton
              label="Bulleted list"
              shortcut="Mod-Shift-8"
              pressed={format.list === 'bullet'}
              onClick={() => run(toggleList('bullet'))}
            >
              <ListIcon />
            </ToolButton>
            <ToolButton
              label="Numbered list"
              shortcut="Mod-Shift-7"
              pressed={format.list === 'ordered'}
              onClick={() => run(toggleList('ordered'))}
            >
              <ListOrderedIcon />
            </ToolButton>
            <ToolButton
              label="Checklist"
              shortcut="Mod-Shift-9"
              pressed={format.list === 'task'}
              onClick={() => run(toggleList('task'))}
            >
              <ListChecksIcon />
            </ToolButton>
            <ToolDivider />
            <LinkPopover
              open={link.open}
              onOpenChange={(open) => setLink((l) => ({ ...l, open }))}
              initialText={link.text}
              onInsert={(text, url) => run(insertLink(text, url))}
              onClose={focusEditor}
            />
            <PagePicker
              lookup={lookup}
              onPick={(docId) => run(insertPageLink(docId))}
              onClose={focusEditor}
            />
            {onUploadImage ? (
              <ToolButton label="Insert image" onClick={() => fileInput.current?.click()}>
                <ImagePlusIcon />
              </ToolButton>
            ) : null}
            <TablePicker onPick={(r, c) => run(insertTable(r, c))} onClose={focusEditor} />
            <MoreMenu
              onClose={focusEditor}
              actions={[
                { label: 'Quote', icon: <QuoteIcon />, onSelect: () => run(toggleQuote()) },
                {
                  label: 'Code block',
                  icon: <SquareCodeIcon />,
                  onSelect: () => run(insertCodeBlock()),
                },
                { label: 'Divider', icon: <MinusIcon />, onSelect: () => run(insertDivider()) },
                {
                  label: 'Decrease indent',
                  icon: <IndentDecreaseIcon />,
                  shortcut: 'Mod-[',
                  separatorBefore: true,
                  onSelect: () => run(outdent()),
                },
                {
                  label: 'Increase indent',
                  icon: <IndentIncreaseIcon />,
                  shortcut: 'Mod-]',
                  onSelect: () => run(indent()),
                },
                {
                  label: 'Clear formatting',
                  icon: <RemoveFormattingIcon />,
                  shortcut: 'Mod-\\',
                  separatorBefore: true,
                  onSelect: () => run(clearFormatting()),
                },
                {
                  label: 'Show Markdown syntax',
                  checked: source,
                  separatorBefore: true,
                  onSelect: toggleSource,
                },
              ]}
            />
            {format.inTable ? (
              <TableMenu
                format={format}
                onOp={(op) => run(tableCommand(op))}
                onClose={focusEditor}
              />
            ) : null}
          </>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-x-0.5">
          {showEditor ? (
            <>
              <ToolButton
                label="Find and replace"
                shortcut="Mod-f"
                onClick={() => {
                  const view = getView()
                  if (view) openSearchPanel(view)
                }}
              >
                <SearchIcon />
              </ToolButton>
              <ToolButton
                label="Outline"
                pressed={outlineOpen}
                className="hidden lg:inline-flex"
                onClick={() => {
                  const view = getView()
                  if (!outlineOpen && view) setActiveHeading(headingIndexAt(view.state))
                  setOutlineOpen(!outlineOpen)
                  focusEditor()
                }}
              >
                <ListTreeIcon />
              </ToolButton>
            </>
          ) : null}
          <ToolButton
            label={full ? 'Exit full screen' : 'Full screen'}
            shortcut={full ? 'Escape' : undefined}
            onClick={() => {
              setFull((f) => !f)
              focusEditor()
            }}
          >
            {full ? <Minimize2Icon /> : <Maximize2Icon />}
          </ToolButton>
          <div
            className="ml-1 flex rounded-md border border-line bg-surface p-0.5"
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
                  'inline-flex h-6 items-center gap-1 rounded-sm px-2 text-sm text-muted transition-colors hover:text-fg',
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
      </div>

      <div
        className={cn(
          'grid flex-1',
          showOutline && 'lg:grid-cols-[13rem_minmax(0,1fr)]',
          full && 'mx-auto w-full max-w-6xl',
        )}
      >
        {showOutline ? (
          <nav aria-label="Outline" className="hidden border-r border-line lg:block">
            <div className="sticky flex flex-col gap-2 px-3 py-4" style={{ top: stickyTop }}>
              <h2 className="label-caps px-2">Outline</h2>
              {outline.length ? (
                <ol className="flex flex-col gap-px text-sm">
                  {outline.map((e, i) => (
                    <li key={`${e.from}-${e.text}`}>
                      <button
                        type="button"
                        onClick={() => jumpTo(e.from)}
                        aria-current={i === activeHeading ? 'location' : undefined}
                        className={cn(
                          'w-full truncate rounded-md py-1 pr-2 text-left text-muted transition-colors hover:bg-surface-2 hover:text-fg',
                          i === activeHeading && 'bg-accent-soft font-medium text-accent',
                        )}
                        style={{ paddingLeft: `${0.5 + Math.max(0, e.level - 2) * 0.75}rem` }}
                      >
                        {e.text}
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="px-2 text-sm text-muted">Headings you add appear here.</p>
              )}
            </div>
          </nav>
        ) : null}
        <div
          className={cn('grid min-w-0', mode === 'split' && 'lg:grid-cols-2')}
          style={{ minHeight }}
        >
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
                  highlightActiveLine: source,
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
              className={cn('min-w-0 px-7 py-5', mode === 'split' && 'max-lg:hidden')}
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
      </div>

      <div
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-3 py-1.5 text-xs text-muted',
          full ? 'sticky bottom-0 bg-surface' : 'rounded-b-lg',
        )}
      >
        <span className="tabular-nums">
          {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
          {words ? ` · ${readingMinutes(words)} min read` : ''}
        </span>
        {uploading ? (
          <span role="status" className="text-accent">
            Uploading {uploading} {uploading === 1 ? 'image' : 'images'}…
          </span>
        ) : null}
        <span className="ml-auto hidden sm:inline">
          Type <kbd className="font-mono">/</kbd> to insert blocks,{' '}
          <kbd className="font-mono">[[</kbd> to link a policy.{' '}
          <kbd className="font-mono">{keyLabel('Mod-s')}</kbd> saves
          {full ? (
            <>
              , <kbd className="font-mono">Esc</kbd> exits full screen
            </>
          ) : null}
          .
        </span>
      </div>

      {onUploadImage ? (
        <input
          ref={fileInput}
          type="file"
          accept={IMAGE_ACCEPT_ATTRIBUTE}
          multiple
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(e) => {
            uploadImages(imageFiles(e.target.files))
            e.target.value = ''
          }}
        />
      ) : null}
    </div>
  )
}
