import type { DocumentImage } from '@/lib/api/types'
import { imageUploadProblem, sniffImageType } from '@/lib/files'
import { HttpError, json, notFound } from '@/mocks/http'
import { orgRoute, type RouteDef } from '@/mocks/router'
import { commit, newId, type MockDocumentImage } from '@/mocks/store'

/** Images inside policy pages. Unlike /files, the mock keeps the bytes so pages render them. */

function toImage(img: MockDocumentImage, orgSlug: string): DocumentImage {
  return {
    id: img.id,
    url: `/api/v1/orgs/${orgSlug}/documents/images/${img.id}`,
    name: img.name,
    size: img.size,
    contentType: img.contentType,
    uploadedAt: img.uploadedAt,
  }
}

export const documentImageRoutes: RouteDef[] = [
  orgRoute(
    'POST',
    '/documents/images',
    { permission: 'policies.edit', feature: 'policies' },
    async (ctx) => {
      const form = await ctx.req.formData().catch(() => null)
      const file = form?.get('file')
      if (!(file instanceof File)) {
        throw new HttpError(400, 'validation_error', 'Choose an image to upload.', {
          file: 'Choose an image.',
        })
      }
      const problem = imageUploadProblem(file)
      if (problem) throw new HttpError(400, 'validation_error', problem, { file: problem })
      const bytes = new Uint8Array(await file.arrayBuffer())
      const actual = sniffImageType(bytes)
      if (!actual) {
        const message = `${file.name} isn’t a valid PNG, JPEG, GIF or WebP image.`
        throw new HttpError(400, 'validation_error', message, { file: message })
      }
      const stored: MockDocumentImage = {
        id: newId('img'),
        orgId: ctx.org.id,
        name: file.name,
        size: file.size,
        // The type the bytes prove, not the one the browser declared.
        contentType: actual,
        data: Buffer.from(bytes).toString('base64'),
        uploadedAt: ctx.now.toISOString(),
        uploadedBy: ctx.user.id,
      }
      ctx.db.documentImages.push(stored)
      commit()
      return json(toImage(stored, ctx.org.slug), 201)
    },
  ),

  orgRoute(
    'GET',
    '/documents/images/:id',
    { permission: 'policies.read', feature: 'policies' },
    (ctx) => {
      const img = ctx.db.documentImages.find(
        (x) => x.id === ctx.params.id && x.orgId === ctx.org.id,
      )
      if (!img) throw notFound('Image')
      return new Response(Buffer.from(img.data, 'base64'), {
        headers: {
          'content-type': img.contentType,
          'content-disposition': 'inline',
          // Images never change after upload; versions that use them are immutable too.
          'cache-control': 'private, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff',
        },
      })
    },
  ),
]
