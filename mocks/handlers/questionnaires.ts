import type {
  Questionnaire,
  QuestionnaireMapping,
  QuestionnaireProgress,
  QuestionnaireRow,
  QuestionnaireRowResult,
  QuestionnaireStatus,
  QuestionnaireSummary,
} from '@/lib/api/types'
import { MAX_UPLOAD_BYTES, formatBytes } from '@/lib/files'
import {
  questionnaireMappingSchema,
  questionnaireRowSchema,
  questionnaireUploadSchema,
} from '@/lib/schemas/questionnaires'
import { draftQuestionnaireAnswer, exportableAnswer } from '@/mocks/ask/policies'
import { audit } from '@/mocks/audit'
import { userName } from '@/mocks/helpers'
import {
  checkVersion,
  HttpError,
  json,
  noContent,
  notFound,
  paginate,
  parse,
  zodFields,
} from '@/mocks/http'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { commit, newId, type MockQuestionnaire } from '@/mocks/store'
import { parseCsv, readXlsx, toCsv, writeXlsx } from '@/mocks/tabular'

export const MAX_QUESTIONNAIRE_ROWS = 500
const PREVIEW_ROWS = 5

function find(ctx: OrgCtx, id: string): MockQuestionnaire {
  const q = ctx.db.questionnaires.find((x) => x.id === id && x.orgId === ctx.org.id)
  if (!q) throw notFound('Questionnaire')
  return q
}

function progressOf(q: MockQuestionnaire): QuestionnaireProgress {
  const count = (s: QuestionnaireRow['status']) => q.rows.filter((r) => r.status === s).length
  return {
    total: q.rows.length,
    approved: count('approved'),
    edited: count('edited'),
    draft: count('draft'),
    needsInput: count('needs_input'),
  }
}

function statusOf(q: MockQuestionnaire): QuestionnaireStatus {
  if (!q.mapping) return 'mapping'
  return q.rows.length > 0 && q.rows.every((r) => r.status === 'approved')
    ? 'complete'
    : 'in_review'
}

function summary(ctx: OrgCtx, q: MockQuestionnaire): QuestionnaireSummary {
  const { header: _h, cells: _c, mapping: _m, rows: _r, sheetName: _s, ...base } = q
  return {
    ...base,
    uploadedByName: userName(ctx.db, q.uploadedBy),
    status: statusOf(q),
    progress: progressOf(q),
  }
}

/** Guess which columns hold questions and answers from their names (and length of text). */
export function suggestMapping(header: string[], cells: string[][]): QuestionnaireMapping {
  const find = (re: RegExp, except?: number) =>
    header.findIndex((h, i) => i !== except && re.test(h))
  // Strongest name first: a "Question" column beats "Control area" or "Item".
  let question = find(/question/i)
  if (question < 0) question = find(/requirement|query|control|item/i)
  if (question < 0) {
    // The column with the longest text on average.
    const lengths = header.map((_, i) => cells.reduce((sum, r) => sum + (r[i]?.length ?? 0), 0))
    question = lengths.indexOf(Math.max(...lengths))
  }
  const answer = find(/answer|response|reply|vendor|supplier comment/i, question)
  return { questionColumn: Math.max(0, question), answerColumn: answer >= 0 ? answer : null }
}

function detail(ctx: OrgCtx, q: MockQuestionnaire): Questionnaire {
  return {
    ...summary(ctx, q),
    columns: q.header,
    preview: q.cells.slice(0, PREVIEW_ROWS),
    suggestedMapping: q.mapping ? null : suggestMapping(q.header, q.cells),
    mapping: q.mapping,
    rows: q.rows.map(({ cellRow: _cr, ...r }) => ({
      ...r,
      editorName: r.editor ? userName(ctx.db, r.editor) : null,
    })),
  }
}

const CSV_TYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
  '',
])
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function fileError(message: string): HttpError {
  return new HttpError(400, 'validation_error', message, { file: message })
}

async function parseUpload(
  file: File,
): Promise<{ format: 'csv' | 'xlsx'; sheetName: string; rows: string[][] }> {
  const name = file.name.toLowerCase()
  if (file.size > MAX_UPLOAD_BYTES) {
    throw fileError(
      `${file.name} is ${formatBytes(file.size)}. Files can be up to ${formatBytes(MAX_UPLOAD_BYTES)}.`,
    )
  }
  if (name.endsWith('.xlsx') || file.type === XLSX_TYPE) {
    try {
      const { sheetName, rows } = readXlsx(Buffer.from(await file.arrayBuffer()))
      return { format: 'xlsx', sheetName, rows }
    } catch {
      throw fileError(
        `${file.name} couldn’t be read as an Excel workbook. Save it as .xlsx or .csv and try again.`,
      )
    }
  }
  if (name.endsWith('.csv') && CSV_TYPES.has(file.type)) {
    return { format: 'csv', sheetName: 'Sheet1', rows: parseCsv(await file.text()) }
  }
  throw fileError(`${file.name} isn’t a CSV or Excel (.xlsx) file.`)
}

/** Drafts an answer for every non-empty question from the approved policies. */
function draftRows(
  ctx: OrgCtx,
  q: MockQuestionnaire,
  mapping: QuestionnaireMapping,
): MockQuestionnaire['rows'] {
  const at = ctx.now.toISOString()
  return q.cells.flatMap((cells, cellRow) => {
    const question = (cells[mapping.questionColumn] ?? '').trim()
    if (!question) return []
    const draft = draftQuestionnaireAnswer(ctx, question)
    return [
      {
        id: newId('qrow'),
        version: 1,
        index: cellRow + 1,
        cellRow,
        question,
        draftAnswer: draft?.answer ?? '',
        citations: draft?.citations ?? [],
        status: draft ? 'draft' : 'needs_input',
        editor: null,
        updatedAt: at,
      },
    ]
  })
}

function exportName(q: MockQuestionnaire): string {
  const base = q.fileName.replace(/\.(csv|xlsx)$/i, '').replace(/["\\/]/g, '')
  return `${base} (answered).${q.format}`
}

export const questionnaireRoutes: RouteDef[] = [
  orgRoute(
    'GET',
    '/questionnaires',
    { permission: 'questionnaires.read', feature: 'questionnaires' },
    (ctx) => {
      const items = ctx.db.questionnaires
        .filter((q) => q.orgId === ctx.org.id)
        .map((q) => summary(ctx, q))
      return json(
        paginate(items, ctx.query, {
          defaultSort: '-uploadedAt',
          search: (q) => [q.name, q.client, q.fileName],
          filters: { status: (q, v) => v.includes(q.status) },
        }),
      )
    },
  ),

  orgRoute(
    'POST',
    '/questionnaires',
    { permission: 'questionnaires.edit', feature: 'questionnaires' },
    async (ctx) => {
      const form = await ctx.req.formData().catch(() => null)
      if (!form)
        throw new HttpError(
          400,
          'validation_error',
          'Send the questionnaire as multipart form data.',
        )
      const fields = questionnaireUploadSchema.safeParse({
        name: form.get('name'),
        client: form.get('client'),
      })
      const file = form.get('file')
      const fieldErrors = fields.success ? {} : zodFields(fields.error)
      if (!(file instanceof File)) fieldErrors.file = 'Choose a CSV or Excel file.'
      if (!fields.success || !(file instanceof File)) {
        throw new HttpError(400, 'validation_error', 'Some fields need attention.', fieldErrors)
      }
      const parsed = await parseUpload(file)
      const rows = parsed.rows.map((r) => r.map((c) => c.trim()))
      const headerAt = rows.findIndex((r) => r.some(Boolean))
      if (headerAt < 0) throw fileError(`${file.name} is empty.`)
      const header = (rows[headerAt] ?? []).map((h, i) => h || `Column ${i + 1}`)
      const width = Math.max(header.length, ...rows.map((r) => r.length))
      while (header.length < width) header.push(`Column ${header.length + 1}`)
      const cells = rows
        .slice(headerAt + 1)
        .filter((r) => r.some(Boolean))
        .map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''))
      if (!cells.length) throw fileError(`${file.name} has a header row but no questions under it.`)
      if (cells.length > MAX_QUESTIONNAIRE_ROWS) {
        throw fileError(
          `${file.name} has ${cells.length} rows. Questionnaires can have up to ${MAX_QUESTIONNAIRE_ROWS}.`,
        )
      }
      const at = ctx.now.toISOString()
      const q: MockQuestionnaire = {
        id: newId('qnr'),
        orgId: ctx.org.id,
        createdAt: at,
        updatedAt: at,
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
        version: 1,
        name: fields.data.name,
        client: fields.data.client,
        fileName: file.name,
        format: parsed.format,
        sheetName: parsed.sheetName,
        uploadedAt: at,
        uploadedBy: ctx.user.id,
        header,
        cells,
        mapping: null,
        rows: [],
      }
      ctx.db.questionnaires.push(q)
      audit(
        ctx,
        'questionnaire.uploaded',
        { type: 'questionnaire', id: q.id, label: q.name },
        { rows: cells.length, file: file.name },
      )
      commit()
      return json(detail(ctx, q), 201)
    },
  ),

  orgRoute(
    'GET',
    '/questionnaires/:id',
    { permission: 'questionnaires.read', feature: 'questionnaires' },
    (ctx) => json(detail(ctx, find(ctx, ctx.params.id ?? ''))),
  ),

  orgRoute(
    'POST',
    '/questionnaires/:id/mapping',
    { permission: 'questionnaires.edit', feature: 'questionnaires' },
    async (ctx) => {
      const input = parse(questionnaireMappingSchema, await ctx.json())
      const q = find(ctx, ctx.params.id ?? '')
      checkVersion(q, input.ifVersion)
      const width = q.header.length
      const fields: Record<string, string> = {}
      if (input.questionColumn >= width) fields.questionColumn = 'Choose one of the file’s columns.'
      if (input.answerColumn !== null && input.answerColumn >= width)
        fields.answerColumn = 'Choose one of the file’s columns.'
      if (Object.keys(fields).length)
        throw new HttpError(400, 'validation_error', 'Some fields need attention.', fields)
      if (q.rows.some((r) => r.status === 'approved' || r.status === 'edited')) {
        throw new HttpError(
          422,
          'unprocessable',
          'Answers have been edited or approved, so the columns can’t change now.',
        )
      }
      const mapping = { questionColumn: input.questionColumn, answerColumn: input.answerColumn }
      const rows = draftRows(ctx, q, mapping)
      if (!rows.length) {
        throw new HttpError(400, 'validation_error', 'That column has no questions in it.', {
          questionColumn: 'That column is empty. Choose the one with the questions.',
        })
      }
      q.mapping = mapping
      q.rows = rows
      q.version += 1
      q.updatedAt = ctx.now.toISOString()
      q.updatedBy = ctx.user.id
      audit(
        ctx,
        'questionnaire.drafted',
        { type: 'questionnaire', id: q.id, label: q.name },
        {
          rows: rows.length,
          needsInput: rows.filter((r) => r.status === 'needs_input').length,
        },
      )
      commit()
      return json(detail(ctx, q))
    },
  ),

  orgRoute(
    'PATCH',
    '/questionnaires/:id/rows/:rowId',
    { permission: 'questionnaires.edit', feature: 'questionnaires' },
    async (ctx) => {
      const input = parse(questionnaireRowSchema, await ctx.json())
      const q = find(ctx, ctx.params.id ?? '')
      const row = q.rows.find((r) => r.id === ctx.params.rowId)
      if (!row) throw notFound('Row')
      checkVersion(row, input.ifVersion)
      const answer = input.draftAnswer !== undefined ? input.draftAnswer.trim() : row.draftAnswer
      let status = input.status ?? row.status
      if (
        input.draftAnswer !== undefined &&
        answer !== row.draftAnswer &&
        input.status === undefined
      )
        status = 'edited'
      if (status === 'approved' && !answer) {
        throw new HttpError(422, 'unprocessable', 'Write an answer before approving this row.')
      }
      if (status === 'draft' && row.status !== 'draft') {
        throw new HttpError(
          422,
          'unprocessable',
          'A reviewed answer can’t go back to Draft. Mark it as needing input instead.',
        )
      }
      row.draftAnswer = answer
      row.status = status
      row.editor = ctx.user.id
      row.version += 1
      row.updatedAt = ctx.now.toISOString()
      q.updatedAt = row.updatedAt
      q.updatedBy = ctx.user.id
      commit()
      const updated = detail(ctx, q).rows.find((r) => r.id === row.id)
      if (!updated) throw notFound('Row')
      const body: QuestionnaireRowResult = {
        ...updated,
        questionnaireStatus: statusOf(q),
        progress: progressOf(q),
      }
      return json(body)
    },
  ),

  orgRoute(
    'DELETE',
    '/questionnaires/:id',
    { permission: 'questionnaires.edit', feature: 'questionnaires' },
    (ctx) => {
      const q = find(ctx, ctx.params.id ?? '')
      ctx.db.questionnaires = ctx.db.questionnaires.filter((x) => x.id !== q.id)
      audit(ctx, 'questionnaire.deleted', { type: 'questionnaire', id: q.id, label: q.name })
      commit()
      return noContent()
    },
  ),

  /** The client's file with the reviewed answers filled in, in its original format. */
  orgRoute(
    'POST',
    '/questionnaires/:id/export',
    { permission: 'questionnaires.read', feature: 'questionnaires' },
    (ctx) => {
      const q = find(ctx, ctx.params.id ?? '')
      if (!q.mapping) throw new HttpError(422, 'unprocessable', 'Map the columns before exporting.')
      const header = [...q.header]
      let answerCol = q.mapping.answerColumn
      if (answerCol === null) {
        answerCol = header.length
        header.push('Answer')
      }
      const grid = q.cells.map((r) => [...r])
      for (const row of q.rows) {
        const text = exportableAnswer(row.draftAnswer)
        const target = grid[row.cellRow]
        // Rows still without an answer keep whatever the client's file had.
        if (target && text) {
          while (target.length <= answerCol) target.push('')
          target[answerCol] = text
        }
      }
      const all = [header, ...grid]
      const name = exportName(q)
      audit(
        ctx,
        'questionnaire.exported',
        { type: 'questionnaire', id: q.id, label: q.name },
        { ...progressOf(q) },
      )
      commit()
      const disposition = `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`
      if (q.format === 'xlsx') {
        return new Response(new Uint8Array(writeXlsx(all, q.sheetName)), {
          headers: { 'content-type': XLSX_TYPE, 'content-disposition': disposition },
        })
      }
      return new Response(`﻿${toCsv(all)}`, {
        headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': disposition },
      })
    },
  ),
]
