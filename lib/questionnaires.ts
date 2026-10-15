import type { QuestionnaireRowStatus, QuestionnaireStatus } from '@/lib/api/types'
import { formatBytes, MAX_UPLOAD_BYTES } from '@/lib/files'

/** Questionnaires are CSV or Excel workbooks (.xlsx). */
export const QUESTIONNAIRE_ACCEPT = '.csv,.xlsx'

export function questionnaireFileProblem(file: { name: string; size: number }): string | null {
  if (!/\.(csv|xlsx)$/i.test(file.name)) return `${file.name} isn’t a CSV or Excel (.xlsx) file.`
  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name} is ${formatBytes(file.size)}. Files can be up to ${formatBytes(MAX_UPLOAD_BYTES)}.`
  }
  return null
}

export const ROW_STATUS_LABELS: Record<QuestionnaireRowStatus, string> = {
  draft: 'Draft',
  edited: 'Edited',
  approved: 'Approved',
  needs_input: 'Needs input',
}

export const QUESTIONNAIRE_STATUS_LABELS: Record<QuestionnaireStatus, string> = {
  mapping: 'Mapping columns',
  in_review: 'In review',
  complete: 'Complete',
}
