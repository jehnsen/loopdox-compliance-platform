import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { StateEffect, StateField, type EditorState, type Range } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { WIKI_LINK } from '@/lib/markdown/wiki-links'
import { toggleTaskAt } from './commands'

/**
 * Live preview: Markdown renders in place (headings, emphasis, links, lists,
 * checklists, quotes, rules, images) while the text stays plain Markdown. The
 * syntax reappears on the lines the cursor or selection touches, so editing is
 * never ambiguous.
 */

/** Only these image sources are loaded in the editor: our own API and https. */
const SAFE_IMAGE = /^(\/(?!\/)|https:\/\/)/i

class BulletWidget extends WidgetType {
  override eq() {
    return true
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-lp-bullet'
    el.textContent = '•'
    el.setAttribute('aria-hidden', 'true')
    return el
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }
  override eq(other: CheckboxWidget) {
    return other.checked === this.checked
  }
  toDOM(view: EditorView) {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'cm-lp-task'
    box.checked = this.checked
    box.setAttribute('aria-label', this.checked ? 'Mark as not done' : 'Mark as done')
    box.addEventListener('mousedown', (e) => e.preventDefault())
    box.addEventListener('click', (e) => {
      e.preventDefault()
      const spec = toggleTaskAt(view.posAtDOM(box))(view.state)
      if (spec) view.dispatch(spec)
    })
    return box
  }
  override ignoreEvent() {
    return true
  }
}

class RuleWidget extends WidgetType {
  override eq() {
    return true
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-lp-rule'
    el.setAttribute('role', 'separator')
    return el
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super()
  }
  override eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt
  }
  toDOM() {
    const wrap = document.createElement('span')
    wrap.className = 'cm-lp-image'
    const img = document.createElement('img')
    img.src = this.src
    img.alt = this.alt
    img.loading = 'lazy'
    img.decoding = 'async'
    img.addEventListener('error', () => {
      wrap.textContent = `Image not available: ${this.alt || this.src}`
      wrap.classList.add('cm-lp-image-missing')
    })
    wrap.appendChild(img)
    return wrap
  }
}

class UploadingWidget extends WidgetType {
  constructor(readonly label: string) {
    super()
  }
  override eq(other: UploadingWidget) {
    return other.label === this.label
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-lp-uploading'
    el.setAttribute('role', 'status')
    el.textContent = this.label
    return el
  }
}

const setFocused = StateEffect.define<boolean>()

/** Whether the editor has focus; without it every line renders, the cursor's included. */
const focused = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setFocused)) value = e.value
    return value
  },
})

/** Line numbers the selection touches while focused: these show their Markdown. */
function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>()
  // States without the focus field (tests, other setups) behave as if focused.
  if (state.field(focused, false) === false) return lines
  for (const r of state.selection.ranges) {
    const last = state.doc.lineAt(r.to).number
    for (let n = state.doc.lineAt(r.from).number; n <= last; n++) lines.add(n)
  }
  return lines
}

const CODE_NODES = new Set(['InlineCode', 'FencedCode', 'CodeBlock', 'CodeText'])

export function buildDecorations(state: EditorState): DecorationSet {
  const tree = ensureSyntaxTree(state, state.doc.length, 50) ?? syntaxTree(state)
  const active = activeLines(state)
  const isActive = (pos: number) => active.has(state.doc.lineAt(pos).number)
  const out: Range<Decoration>[] = []
  const hide = (from: number, to: number) => {
    if (to > from) out.push(Decoration.replace({}).range(from, to))
  }
  const lineClass = (from: number, to: number, cls: string) => {
    const first = state.doc.lineAt(from).number
    const last = state.doc.lineAt(Math.max(from, to - 1)).number
    for (let n = first; n <= last; n++)
      out.push(Decoration.line({ class: cls }).range(state.doc.line(n).from))
  }
  const mark = (from: number, to: number, cls: string) => {
    if (to > from) out.push(Decoration.mark({ class: cls }).range(from, to))
  }

  tree.iterate({
    enter(node) {
      const { name, from, to } = node
      const heading = /^ATXHeading(\d)$/.exec(name)
      if (heading) {
        lineClass(from, to, `cm-lp-h${heading[1]}`)
        return
      }
      switch (name) {
        case 'HeaderMark': {
          if (isActive(from)) return
          const line = state.doc.lineAt(from)
          // Opening "## " (with its space) or closing " ##".
          if (from - line.from <= 3) hide(from, Math.min(to + 1, line.to))
          else hide(Math.max(from - 1, line.from), to)
          return
        }
        case 'EmphasisMark':
        case 'StrikethroughMark':
          if (!isActive(from)) hide(from, to)
          return
        case 'InlineCode':
          mark(from, to, 'cm-lp-code')
          if (!isActive(from)) {
            const open = node.node.firstChild
            const close = node.node.lastChild
            if (open?.name === 'CodeMark') hide(open.from, open.to)
            if (close?.name === 'CodeMark' && close.from !== open?.from) hide(close.from, close.to)
          }
          return false
        case 'Link': {
          const marks = node.node.getChildren('LinkMark')
          const url = node.node.getChild('URL')
          const open = marks[0]
          const close = marks[1]
          if (!open || !close || !url) return
          mark(open.to, close.from, 'cm-lp-link')
          if (!isActive(from)) {
            hide(open.from, open.to)
            hide(close.from, to)
          }
          return false
        }
        case 'Image': {
          const url = node.node.getChild('URL')
          const marks = node.node.getChildren('LinkMark')
          const alt = marks[0] && marks[1] ? state.sliceDoc(marks[0].to, marks[1].from) : ''
          const src = url ? state.sliceDoc(url.from, url.to) : ''
          if (!src && alt.startsWith('Uploading ')) {
            out.push(
              Decoration.replace({
                widget: new UploadingWidget(alt.replace(/\s+\S+$/, '')),
              }).range(from, to),
            )
          } else if (!isActive(from) && SAFE_IMAGE.test(src)) {
            out.push(Decoration.replace({ widget: new ImageWidget(src, alt) }).range(from, to))
          }
          return false
        }
        case 'ListMark': {
          if (isActive(from)) return
          const item = node.node.parent
          const list = item?.parent
          const task = item?.getChild('Task')
          if (task) hide(from, Math.min(to + 1, task.from))
          else if (list?.name === 'BulletList')
            out.push(Decoration.replace({ widget: new BulletWidget() }).range(from, to))
          else mark(from, to, 'cm-lp-number')
          return
        }
        case 'TaskMarker': {
          if (isActive(from)) return
          const checked = /x/i.test(state.sliceDoc(from, to))
          out.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(from, to))
          if (checked) {
            const line = state.doc.lineAt(from)
            mark(to, line.to, 'cm-lp-done')
          }
          return
        }
        case 'Blockquote':
          lineClass(from, to, 'cm-lp-quote')
          return
        case 'QuoteMark': {
          if (isActive(from)) return
          const next = state.sliceDoc(to, to + 1)
          hide(from, next === ' ' ? to + 1 : to)
          return
        }
        case 'HorizontalRule':
          if (!isActive(from))
            out.push(Decoration.replace({ widget: new RuleWidget() }).range(from, to))
          return
        case 'FencedCode':
        case 'CodeBlock':
          lineClass(from, to, 'cm-lp-codeblock')
          return false
        case 'Table':
          lineClass(from, to, 'cm-lp-table')
          return false
      }
    },
  })

  // [[ITD-006]] page links: not part of the Markdown grammar, so found by pattern.
  const text = state.doc.toString()
  for (const m of text.matchAll(new RegExp(WIKI_LINK.source, 'g'))) {
    const from = m.index
    const to = from + m[0].length
    const inner = tree.resolveInner(from, 1)
    let n: typeof inner | null = inner
    let inCode = false
    while (n) {
      if (CODE_NODES.has(n.name)) inCode = true
      n = n.parent
    }
    if (inCode) continue
    const id = m[1] ?? ''
    const shownFrom = m[2] ? from + 2 + id.length + 1 : from + 2
    mark(shownFrom, to - 2, 'cm-lp-wiki')
    if (!isActive(from)) {
      hide(from, shownFrom)
      hide(to - 2, to)
    }
  }

  return Decoration.set(out, true)
}

const decorations = StateField.define<DecorationSet>({
  create: buildDecorations,
  update(value, tr) {
    if (
      tr.docChanged ||
      tr.selection ||
      tr.effects.some((e) => e.is(setFocused)) ||
      syntaxTree(tr.state) !== syntaxTree(tr.startState)
    )
      return buildDecorations(tr.state)
    return value
  },
  provide: (field) => EditorView.decorations.from(field),
})

export const livePreview = [
  focused,
  EditorView.focusChangeEffect.of((_state, focusing) => setFocused.of(focusing)),
  decorations,
]
