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

// ---------------------------------------------------------------------------
// Images inside policy pages
// ---------------------------------------------------------------------------

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** Raster formats only: SVG can carry scripts, so it is never accepted. */
export const IMAGE_UPLOAD_TYPES: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/gif': 'GIF',
  'image/webp': 'WebP',
}

export const IMAGE_ACCEPT_ATTRIBUTE = '.png,.jpg,.jpeg,.gif,.webp'

/** Plain-language reason an image can't be added to a page, or null when it can. */
export function imageUploadProblem(file: {
  size: number
  type: string
  name: string
}): string | null {
  if (!(file.type in IMAGE_UPLOAD_TYPES)) {
    return `${file.name} isn’t a supported image. Use a PNG, JPEG, GIF or WebP file.`
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `${file.name} is ${formatBytes(file.size)}. Images can be up to ${formatBytes(MAX_IMAGE_BYTES)}.`
  }
  return null
}

/**
 * The image type a file really is, from its first bytes; null when it isn't one
 * we accept. The server checks this rather than trusting the declared type, so a
 * renamed HTML or SVG file can't be served as an image.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  const starts = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b)
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (starts([0x47, 0x49, 0x46, 0x38])) return 'image/gif'
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'
  return null
}
