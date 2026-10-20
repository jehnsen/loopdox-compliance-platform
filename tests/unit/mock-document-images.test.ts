// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import type { DocumentImage, TokenPair } from '@/lib/api/types'
import { imageUploadProblem, sniffImageType } from '@/lib/files'
import { dispatchMock } from '@/mocks/dispatch'
import { resetDb } from '@/mocks/store'

const NOW = new Date('2026-10-14T04:00:00Z')
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')

async function login(email: string) {
  const res = await dispatchMock(
    new Request('http://mock.local/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'loopdox-demo' }),
    }),
  )
  return ((await res.json()) as TokenPair).accessToken
}

function upload(
  token: string,
  bytes: Uint8Array<ArrayBuffer>,
  name: string,
  type: string,
  org = '3rdloop',
) {
  const form = new FormData()
  form.set('file', new File([bytes], name, { type }))
  return dispatchMock(
    new Request(`http://mock.local/api/v1/orgs/${org}/documents/images`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: form,
    }),
  )
}

function fetchImage(token: string, url: string) {
  return dispatchMock(
    new Request(`http://mock.local${url}`, { headers: { authorization: `Bearer ${token}` } }),
  )
}

let editor: string
let staff: string

beforeEach(async () => {
  resetDb(NOW)
  editor = await login('jehnsen.enrique@3rdloop.example')
  staff = await login('staff@3rdloop.example')
})

describe('policy images', () => {
  it('stores an upload and serves the same bytes inline with safe headers', async () => {
    const res = await upload(editor, PNG, 'diagram.png', 'image/png')
    expect(res.status).toBe(201)
    const img = (await res.json()) as DocumentImage
    expect(img.url).toBe(`/api/v1/orgs/3rdloop/documents/images/${img.id}`)
    expect(img.contentType).toBe('image/png')

    // Staff can't upload, but can see images on the pages they read.
    const got = await fetchImage(staff, img.url)
    expect(got.status).toBe(200)
    expect(got.headers.get('content-type')).toBe('image/png')
    expect(got.headers.get('content-disposition')).toBe('inline')
    expect(got.headers.get('x-content-type-options')).toBe('nosniff')
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(PNG)
  })

  it('refuses SVG, and files whose bytes aren’t the image they claim to be', async () => {
    expect((await upload(editor, SVG, 'logo.svg', 'image/svg+xml')).status).toBe(400)
    const disguised = await upload(editor, SVG, 'logo.png', 'image/png')
    expect(disguised.status).toBe(400)
    expect(
      ((await disguised.json()) as { error: { fields: { file: string } } }).error.fields.file,
    ).toMatch(/isn’t a valid PNG/)
  })

  it('needs policies.edit to upload', async () => {
    expect((await upload(staff, PNG, 'x.png', 'image/png')).status).toBe(403)
  })

  it('keeps images inside their organisation', async () => {
    const img = (await (await upload(editor, PNG, 'x.png', 'image/png')).json()) as DocumentImage
    const clinic = await login('liza.santos@sample-clinic.example')
    const res = await fetchImage(clinic, img.url.replace('/orgs/3rdloop/', '/orgs/sample-clinic/'))
    expect(res.status).toBe(404)
  })
})

describe('image rules', () => {
  it('sniffs real image types from the first bytes', () => {
    expect(sniffImageType(PNG)).toBe('image/png')
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffImageType(SVG)).toBeNull()
  })

  it('explains size and type problems in plain language', () => {
    expect(imageUploadProblem({ name: 'a.svg', type: 'image/svg+xml', size: 10 })).toMatch(
      /PNG, JPEG, GIF or WebP/,
    )
    expect(
      imageUploadProblem({ name: 'big.png', type: 'image/png', size: 6 * 1024 * 1024 }),
    ).toMatch(/up to 5.0 MB/)
    expect(imageUploadProblem({ name: 'ok.webp', type: 'image/webp', size: 1000 })).toBeNull()
  })
})
