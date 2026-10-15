import { uploadProblem } from '@/lib/files'
import { forbidden, HttpError, json, notFound } from '@/mocks/http'
import { orgRoute, type RouteDef } from '@/mocks/router'
import { commit, newId, type MockFile } from '@/mocks/store'

/** Uploads. The mock keeps metadata only. */

export const fileRoutes: RouteDef[] = [
  orgRoute('POST', '/files', {}, async (ctx) => {
    if (!ctx.can('privacy.edit') && !ctx.can('security.edit') && !ctx.can('evidence.edit')) {
      throw forbidden()
    }
    const form = await ctx.req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) {
      throw new HttpError(400, 'validation_error', 'Choose a file to upload.', {
        file: 'Choose a file.',
      })
    }
    const problem = uploadProblem(file)
    if (problem) throw new HttpError(400, 'validation_error', problem, { file: problem })
    // Mock mode keeps the metadata only; GET /files/:id returns a placeholder.
    const stored: MockFile = {
      id: newId('file'),
      orgId: ctx.org.id,
      name: file.name,
      size: file.size,
      contentType: file.type,
      uploadedAt: ctx.now.toISOString(),
      uploadedBy: ctx.user.id,
    }
    ctx.db.files.push(stored)
    commit()
    const { orgId: _orgId, ...ref } = stored
    return json(ref, 201)
  }),

  orgRoute('GET', '/files/:id', {}, (ctx) => {
    const f = ctx.db.files.find((x) => x.id === ctx.params.id && x.orgId === ctx.org.id)
    if (!f) throw notFound('File')
    const body = `Mock mode keeps no file contents.\n\nFile: ${f.name}\nSize: ${f.size} bytes\nUploaded: ${f.uploadedAt}\n`
    return new Response(body, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename="${f.name.replace(/"/g, '')}.txt"`,
      },
    })
  }),
]
