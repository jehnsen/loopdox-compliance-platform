'use client'

import { ApiError, orgPath, toApiError } from '@/lib/api/client'
import type { FileRef } from '@/lib/api/types'

/**
 * Uploads one file to POST /orgs/:org/files (multipart). Uses XMLHttpRequest
 * because fetch can't report upload progress.
 */
export function uploadFile(
  org: string,
  file: File,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<FileRef> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/v1${orgPath(org, '/files')}`)
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => {
      const res = new Response(xhr.responseText || null, {
        status: xhr.status,
        headers: { 'content-type': xhr.getResponseHeader('content-type') ?? 'application/json' },
      })
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1)
        resolve(JSON.parse(xhr.responseText) as FileRef)
      } else void toApiError(res).then(reject)
    }
    xhr.onerror = () =>
      reject(new ApiError(0, 'network_error', 'The upload failed. Check your connection.'))
    xhr.onabort = () => reject(new ApiError(0, 'aborted', 'Upload cancelled.'))
    signal?.addEventListener('abort', () => xhr.abort())
    const body = new FormData()
    body.append('file', file)
    xhr.send(body)
  })
}
