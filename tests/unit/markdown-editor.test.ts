import { CompletionContext } from '@codemirror/autocomplete'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { countWords, headingOutline, readingMinutes } from '@/lib/markdown/outline'
import {
  clearFormatting,
  formatAt,
  insertBlock,
  insertDivider,
  insertLink,
  normalizeUrl,
  setBlockStyle,
  tableCommand,
  toggleInline,
  toggleList,
  toggleTaskAt,
  type Command,
} from '@/components/markdown/editor/commands'
import { buildDecorations } from '@/components/markdown/editor/live-preview'
import { slashCompletion } from '@/components/markdown/editor/slash-commands'
import { editTable, findTable, splitRow } from '@/components/markdown/editor/tables'

/** A state with the cursor at `anchor` (or a selection to `head`). */
function make(doc: string, anchor = doc.length, head = anchor) {
  return EditorState.create({
    doc,
    selection: EditorSelection.single(anchor, head),
    extensions: [markdown({ base: markdownLanguage })],
  })
}

function apply(state: EditorState, cmd: Command) {
  const spec = cmd(state)
  return spec ? state.update(spec).state : state
}

const text = (s: EditorState) => s.doc.toString()

describe('inline formatting', () => {
  it('wraps the selection and toggles it back off', () => {
    const bold = apply(make('make it strong', 8, 14), toggleInline('bold'))
    expect(text(bold)).toBe('make it **strong**')
    expect(text(apply(bold, toggleInline('bold')))).toBe('make it strong')
  })

  it('unwraps the whole span when the cursor is inside it', () => {
    expect(text(apply(make('a **bold** word', 6), toggleInline('bold')))).toBe('a bold word')
  })

  it('does not unwrap when the cursor is just after the span', () => {
    const state = make('a **bold** word', 10)
    expect(formatAt(state).bold).toBe(false)
    expect(text(apply(state, toggleInline('bold')))).toBe('a **bold****bold text** word')
  })

  it('reports active formats for the toolbar', () => {
    const f = formatAt(make('_soft_ and ~~gone~~', 2))
    expect(f.italic).toBe(true)
    expect(f.strike).toBe(false)
  })
})

describe('line formatting', () => {
  it('sets and clears heading levels, dropping list markers', () => {
    const h = apply(make('- Purpose', 3), setBlockStyle(2))
    expect(text(h)).toBe('## Purpose')
    expect(text(apply(h, setBlockStyle(0)))).toBe('Purpose')
  })

  it('puts the cursor after a marker added to an empty line', () => {
    const h = apply(make('Intro\n\n', 7), setBlockStyle(2))
    expect(text(h)).toBe('Intro\n\n## ')
    expect(h.selection.main.head).toBe(10)
  })

  it('numbers a list, skips blank lines and toggles it off', () => {
    const doc = 'one\n\ntwo\nthree'
    const listed = apply(make(doc, 0, doc.length), toggleList('ordered'))
    expect(text(listed)).toBe('1. one\n\n2. two\n3. three')
    const off = apply(
      listed.update({ selection: EditorSelection.single(0, listed.doc.length) }).state,
      toggleList('ordered'),
    )
    expect(text(off)).toBe(doc)
  })

  it('converts between list kinds and ticks checklist items', () => {
    const task = apply(make('- item', 3), toggleList('task'))
    expect(text(task)).toBe('- [ ] item')
    expect(text(apply(task, toggleTaskAt(3)))).toBe('- [x] item')
  })

  it('clears inline marks, links and heading markers on the line', () => {
    expect(text(apply(make('## **Bold** and [link](https://x.y)', 4), clearFormatting()))).toBe(
      'Bold and link',
    )
  })
})

describe('blocks', () => {
  it('keeps a blank line above a divider so the text above stays a paragraph', () => {
    const s = apply(make('Para', 4), insertDivider())
    expect(text(s)).toBe('Para\n\n---\n')
    expect(s.selection.main.head).toBe(s.doc.length)
  })

  it('separates a block from text below it', () => {
    expect(text(apply(make('Para\nNext', 2), insertBlock('---')))).toBe('Para\n\n---\n\nNext')
  })

  it('normalises link URLs', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com')
    expect(normalizeUrl('/3rdloop/policies')).toBe('/3rdloop/policies')
    expect(normalizeUrl('mailto:dpo@x.ph')).toBe('mailto:dpo@x.ph')
    expect(text(apply(make(''), insertLink('', 'x.ph')))).toBe('[https://x.ph](https://x.ph)')
  })
})

describe('tables', () => {
  const table = ['| A | B |', '| --- | --- |', '| 1 | 2 |']

  it('splits rows, keeping escaped pipes in their cell', () => {
    expect(splitRow('| a \\| b | c |')).toEqual(['a \\| b', 'c'])
  })

  it('finds the cell under the cursor', () => {
    expect(findTable(['intro', ...table], 3, 7)).toMatchObject({ start: 1, row: 2, col: 1 })
    expect(findTable(['| not | a table |'], 0, 3)).toBeNull()
  })

  it('adds and removes rows and columns, never the header', () => {
    expect(editTable(table, 'row-below', 0, 0)?.lines).toEqual([
      ...table.slice(0, 2),
      '|  |  |',
      table[2],
    ])
    expect(editTable(table, 'col-right', 2, 0)?.lines[0]).toBe('| A | Column | B |')
    expect(editTable(table, 'del-col', 2, 1)?.lines).toEqual(['| A |', '| --- |', '| 1 |'])
    expect(editTable(table, 'del-row', 0, 0)).toBeNull()
    expect(editTable(['| A |', '| --- |'], 'del-col', 0, 0)).toBeNull()
  })

  it('edits only the table in the document', () => {
    const doc = `Intro\n\n${table.join('\n')}\n\nAfter`
    const s = apply(make(doc, doc.indexOf('| 1')), tableCommand('del-row'))
    expect(text(s)).toBe('Intro\n\n| A | B |\n| --- | --- |\n\nAfter')
  })
})

describe('outline and counts', () => {
  it('lists headings with positions, ignoring fenced code', () => {
    const doc = '## One\ntext\n```\n## not a heading\n```\n### Two **bold**'
    expect(headingOutline(doc)).toEqual([
      { level: 2, text: 'One', from: 0 },
      { level: 3, text: 'Two bold', from: doc.indexOf('### Two') },
    ])
  })

  it('counts words, not syntax or URLs', () => {
    expect(countWords('## Scope\n\n- **All** [staff](https://x.ph/a-b-c) and [[ITD-001]]')).toBe(5)
    expect(countWords('| A | B |\n| --- | --- |')).toBe(2)
    expect(readingMinutes(0)).toBe(0)
    expect(readingMinutes(450)).toBe(2)
  })
})

describe('slash commands', () => {
  const source = slashCompletion(() => [
    { label: 'Section heading', keywords: 'h2', run: () => undefined },
    { label: 'Divider', keywords: 'hr rule', run: () => undefined },
  ])
  const complete = (doc: string) => source(new CompletionContext(make(doc), doc.length, false))

  it('opens at the start of a line and filters by label or keyword', () => {
    expect(complete('/')?.options.map((o) => o.label)).toEqual(['Section heading', 'Divider'])
    expect(complete('Intro\n/h2')?.options.map((o) => o.label)).toEqual(['Section heading'])
    expect(complete('Intro\n/h')?.options.map((o) => o.label)).toEqual([
      'Section heading',
      'Divider',
    ])
    expect(complete('text /rule')?.options.map((o) => o.label)).toEqual(['Divider'])
  })

  it('stays out of URLs, paths and code', () => {
    expect(complete('see https:/')).toBeNull()
    expect(complete('a/b')).toBeNull()
    expect(complete('`code /')).not.toBeNull() // unclosed backticks aren't code yet
    expect(complete('```\n/')).toBeNull()
  })
})

describe('live preview', () => {
  /** Replaced (hidden or widget) ranges in the decoration set. */
  function replaced(state: EditorState) {
    const out: string[] = []
    buildDecorations(state).between(0, state.doc.length, (from, to, d) => {
      if (d.spec.widget || (d.point && to > from)) out.push(state.sliceDoc(from, to))
    })
    return out
  }

  it('hides Markdown symbols except on the line being edited', () => {
    const doc = '## Purpose\n\nSome **bold** text'
    expect(replaced(make(doc, doc.length))).toContain('## ')
    expect(replaced(make(doc, 3))).not.toContain('## ')
    expect(replaced(make(doc, 3))).toContain('**')
  })

  it('renders images only from our API or https', () => {
    const ours = '![chart](/api/v1/orgs/x/documents/images/img_1)\n\nend'
    const other = '![x](javascript:alert(1))\n\nend'
    expect(replaced(make(ours))).toContain('![chart](/api/v1/orgs/x/documents/images/img_1)')
    expect(replaced(make(other))).toEqual([])
  })
})

describe('blocks never split tables or code', () => {
  it('inserts after the table when the cursor is inside it', () => {
    const doc = '| A | B |\n| --- | --- |\n| 1 | 2 |'
    expect(text(apply(make(doc, 3), insertBlock('---')))).toBe(`${doc}\n\n---\n`)
  })

  it('inserts after a fenced code block, even from its opening line', () => {
    const doc = '```\ncode\n```\n\nNext'
    expect(text(apply(make(doc, 0), insertBlock('---')))).toBe('```\ncode\n```\n\n---\n\nNext')
  })
})
