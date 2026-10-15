import { ApiError, orgPath, toApiError } from '@/lib/api/client'
import type { AskRequest, AskStreamEvent } from '@/lib/api/types'

export interface SseMessage {
  event: string
  data: string
}

/**
 * Parses a Server-Sent Events byte stream (WHATWG rules: `event:` and `data:`
 * fields, blank line ends a message, `:` lines are comments, CRLF or LF).
 */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let event = 'message'
  let data: string[] = []
  const dispatch = function* (): Generator<SseMessage> {
    if (data.length) yield { event, data: data.join('\n') }
    event = 'message'
    data = []
  }
  try {
    for (;;) {
      const { value, done } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.search(/\r\n|\r|\n/)) >= 0) {
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + (buffer.startsWith('\r\n', nl) ? 2 : 1))
        if (line === '') {
          yield* dispatch()
          continue
        }
        if (line.startsWith(':')) continue
        const colon = line.indexOf(':')
        const field = colon < 0 ? line : line.slice(0, colon)
        const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
        if (field === 'event') event = value
        else if (field === 'data') data.push(value)
      }
      if (done) {
        yield* dispatch()
        return
      }
    }
  } finally {
    reader.releaseLock()
  }
}

const EVENTS = new Set(['route', 'citation', 'token', 'done', 'error'])

/**
 * POST /orgs/:org/ask and hands each event to `onEvent` as it arrives. Errors
 * before the stream starts (validation, plan limits) throw an ApiError.
 */
export async function streamAsk(
  org: string,
  request: AskRequest,
  onEvent: (e: AskStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/v1${orgPath(org, '/ask')}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(request),
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  })
  if (!res.ok) throw await toApiError(res)
  if (!res.body || !res.headers.get('content-type')?.includes('text/event-stream')) {
    throw new ApiError(502, 'bad_stream', 'Ask returned an unexpected response. Try again.')
  }
  for await (const msg of readSse(res.body)) {
    if (!EVENTS.has(msg.event)) continue
    let data: unknown
    try {
      data = JSON.parse(msg.data)
    } catch {
      continue
    }
    onEvent({ event: msg.event, data } as AskStreamEvent)
  }
}
