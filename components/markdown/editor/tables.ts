/** GFM table helpers for the editor. Rows are edited as text; only touched lines are rewritten. */

const DELIMITER_CELL = /^\s*:?-{1,}:?\s*$/

/** Cells of one table line, trimmed. Escaped pipes (`\|`) stay inside their cell. */
export function splitRow(line: string): string[] {
  let body = line.trim()
  if (body.startsWith('|')) body = body.slice(1)
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1)
  const cells: string[] = []
  let cell = ''
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '\\' && body[i + 1] === '|') {
      cell += '\\|'
      i++
    } else if (ch === '|') {
      cells.push(cell.trim())
      cell = ''
    } else cell += ch
  }
  cells.push(cell.trim())
  return cells
}

export function joinRow(cells: string[]): string {
  return `| ${cells.join(' | ')} |`
}

export function isDelimiterRow(line: string): boolean {
  if (!line.includes('-')) return false
  const cells = splitRow(line)
  return cells.length > 0 && cells.every((c) => DELIMITER_CELL.test(c))
}

function looksLikeRow(line: string): boolean {
  return line.includes('|') && line.trim().length > 1
}

export interface TableAt {
  /** Index of the header line in `lines`. */
  start: number
  /** Index of the last body line in `lines`. */
  end: number
  /** Row under the cursor, relative to `start` (0 = header, 1 = delimiter). */
  row: number
  /** Column under the cursor. */
  col: number
  columns: number
}

/** The table containing `lineIndex`, if any. `column` is the cursor's offset in that line. */
export function findTable(lines: string[], lineIndex: number, column: number): TableAt | null {
  const at = lines[lineIndex]
  if (at === undefined || !looksLikeRow(at)) return null
  let start = lineIndex
  while (start > 0 && looksLikeRow(lines[start - 1] ?? '')) start--
  let end = lineIndex
  while (end < lines.length - 1 && looksLikeRow(lines[end + 1] ?? '')) end++
  // A table needs a header followed by a delimiter row.
  const delimiter = lines.slice(start, end + 1).findIndex(isDelimiterRow)
  if (delimiter < 1) return null
  start += delimiter - 1
  if (lineIndex < start) return null
  const before = at.slice(0, column)
  let pipes = 0
  for (let i = 0; i < before.length; i++) {
    if (before[i] === '|' && before[i - 1] !== '\\') pipes++
  }
  const leading = at.trimStart().startsWith('|') ? 1 : 0
  const columns = splitRow(lines[start] ?? '').length
  const col = Math.min(Math.max(pipes - leading, 0), columns - 1)
  return { start, end, row: lineIndex - start, col, columns }
}

/** Builds a new table: `rows` counts the header row. */
export function buildTable(rows: number, cols: number): string {
  const header = Array.from({ length: cols }, (_, i) => `Column ${i + 1}`)
  const lines = [joinRow(header), joinRow(header.map(() => '---'))]
  for (let r = 1; r < rows; r++) lines.push(joinRow(header.map(() => '')))
  return lines.join('\n')
}

export type TableOp = 'row-above' | 'row-below' | 'col-left' | 'col-right' | 'del-row' | 'del-col'

/**
 * Applies a structural edit to the table's lines (header first). Returns the new
 * lines and the row index the cursor should land on, or null when the edit
 * isn't possible (deleting the header row or the last column).
 */
export function editTable(
  table: string[],
  op: TableOp,
  row: number,
  col: number,
): { lines: string[]; row: number } | null {
  const rows = table.map(splitRow)
  const width = rows[0]?.length ?? 0
  const blank = () => Array.from({ length: width }, () => '')
  // The header and delimiter rows act as one unit for row insertion.
  const bodyRow = Math.max(row, 1)
  switch (op) {
    case 'row-above': {
      const at = row <= 1 ? 2 : row
      rows.splice(at, 0, blank())
      return { lines: rows.map(joinRow), row: at }
    }
    case 'row-below': {
      const at = bodyRow + 1
      rows.splice(at, 0, blank())
      return { lines: rows.map(joinRow), row: at }
    }
    case 'del-row': {
      if (row <= 1) return null
      rows.splice(row, 1)
      return { lines: rows.map(joinRow), row: Math.min(row, rows.length - 1) }
    }
    case 'col-left':
    case 'col-right': {
      const at = op === 'col-left' ? col : col + 1
      rows.forEach((cells, i) => cells.splice(at, 0, i === 0 ? 'Column' : i === 1 ? '---' : ''))
      return { lines: rows.map(joinRow), row }
    }
    case 'del-col': {
      if (width <= 1) return null
      rows.forEach((cells) => cells.splice(col, 1))
      return { lines: rows.map(joinRow), row }
    }
  }
}
