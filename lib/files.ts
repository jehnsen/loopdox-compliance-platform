/** Upload rules shared by FileDropzone and the mock API (the backend enforces the same). */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'text/plain': 'Text',
  'text/csv': 'CSV',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
}

export const ACCEPT_ATTRIBUTE = '.pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx'

/** "284 KB", "1.2 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Plain-language reason a file can't be uploaded, or null when it can. */
export function uploadProblem(file: { size: number; type: string; name: string }): string | null {
  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name} is ${formatBytes(file.size)}. Files can be up to ${formatBytes(MAX_UPLOAD_BYTES)}.`
  }
  if (!(file.type in ALLOWED_UPLOAD_TYPES)) {
    return `${file.name} isn’t a supported type. Upload a PDF, Word, Excel, CSV, text or image file.`
  }
  return null
}
