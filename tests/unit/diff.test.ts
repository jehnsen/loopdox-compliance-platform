import { describe, expect, it } from 'vitest'
import { collapseUnchanged, diffStats, lineDiff, toSplitRows, wordSegments } from '@/lib/diff'

const OLD = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'].join('\n')
const NEW = ['a', 'b', 'c', 'd', 'e', 'F', 'g', 'h', 'i', 'j', 'k', 'l', 'm'].join('\n')

describe('lineDiff', () => {
  it('numbers lines on both sides and counts changes', () => {
    const lines = lineDiff(OLD, NEW)
    expect(diffStats(lines)).toEqual({ added: 2, removed: 1 })
    const del = lines.find((l) => l.kind === 'del')
    const add = lines.find((l) => l.kind === 'add')
    expect(del).toMatchObject({ text: 'f', oldNo: 6, newNo: null })
    expect(add).toMatchObject({ text: 'F', oldNo: null, newNo: 6 })
    expect(lines.at(-1)).toMatchObject({ kind: 'add', text: 'm', newNo: 13 })
  })

  it('reports no changes for identical text', () => {
    expect(diffStats(lineDiff('x\ny', 'x\ny'))).toEqual({ added: 0, removed: 0 })
  })
})

describe('collapseUnchanged', () => {
  it('keeps context around changes and hides long unchanged runs', () => {
    const blocks = collapseUnchanged(lineDiff(OLD, NEW), 2, 2)
    expect(blocks[0]).toMatchObject({ type: 'collapsed' })
    expect(blocks[0]?.lines.map((l) => l.text)).toEqual(['a', 'b', 'c'])
    const visible = blocks
      .filter((b) => b.type === 'lines')
      .flatMap((b) => b.lines.map((l) => l.text))
    expect(visible.slice(0, 4)).toEqual(['d', 'e', 'f', 'F'])
  })

  it('does not collapse short runs', () => {
    expect(collapseUnchanged(lineDiff('a\nb\nc', 'a\nB\nc')).every((b) => b.type === 'lines')).toBe(
      true,
    )
  })
})

describe('side by side and word highlights', () => {
  it('pairs removed and added lines', () => {
    const rows = toSplitRows(lineDiff('x\nold\ny', 'x\nnew 1\nnew 2\ny'))
    expect(rows.map((r) => [r.left?.text ?? null, r.right?.text ?? null])).toEqual([
      ['x', 'x'],
      ['old', 'new 1'],
      [null, 'new 2'],
      ['y', 'y'],
    ])
  })

  it('marks only the changed words', () => {
    const segs = wordSegments('MFA for admin accounts', 'MFA for all accounts')
    expect(segs.old.filter((s) => s.changed).map((s) => s.text)).toEqual(['admin'])
    expect(segs.new.filter((s) => s.changed).map((s) => s.text)).toEqual(['all'])
  })
})
