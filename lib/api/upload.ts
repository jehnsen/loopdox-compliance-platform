'use client'

import { ApiError, orgPath, toApiError } from '@/lib/api/client'
import type { EvidenceItem, EvidenceUploadFields, FileRef, Questionnaire } from '@/lib/api/types'

/**
 * Sends a multipart form to /orgs/:org<path>. Uses XMLHttpRequest because fetch can't
 * report upload progress.
 */
function postForm<T>(
  org: string,
  path: string,
  body: FormData,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/v1${orgPath(org, path)}`)
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
        resolve(JSON.parse(xhr.responseText) as T)
      } else void toApiError(res).then(reject)
    }
    xhr.onerror = () =>
      reject(new ApiError(0, 'network_error', 'The upload failed. Check your connection.'))
    xhr.onabort = () => reject(new ApiError(0, 'aborted', 'Upload cancelled.'))
    signal?.addEventListener('abort', () => xhr.abort())
    xhr.send(body)
  })
}

/** Uploads one file to POST /orgs/:org/files (multipart). */
export function uploadFile(
  org: string,
  file: File,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<FileRef> {
  const body = new FormData()
  body.append('file', file)
  return postForm<FileRef>(org, '/files', body, onProgress, signal)
}

/** Uploads a file as evidence for a control: POST /orgs/:org/evidence (multipart). */
export function uploadEvidence(
  org: string,
  fields: EvidenceUploadFields,
  file: File,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<EvidenceItem> {
  const body = new FormData()
  body.append('controlId', fields.controlId)
  body.append('summary', fields.summary)
  body.append('result', fields.result)
  if (fields.collectedOn) body.append('collectedOn', fields.collectedOn)
  body.append('file', file)
  return postForm<EvidenceItem>(org, '/evidence', body, onProgress, signal)
}

/** Uploads a client questionnaire (CSV or XLSX): POST /orgs/:org/questionnaires (multipart). */
export function uploadQuestionnaire(
  org: string,
  fields: { name: string; client: string },
  file: File,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<Questionnaire> {
  const body = new FormData()
  body.append('name', fields.name)
  body.append('client', fields.client)
  body.append('file', file)
  return postForm<Questionnaire>(org, '/questionnaires', body, onProgress, signal)
}
