import { brandSchema, emptyData, type Workspace } from '../../../shared/workspace'

export default defineEventHandler(async event => {
  requireOrigin(event)
  const { user } = await requireUser(event)
  const brand = await readValidatedBody(event, brandSchema.parse)
  const { data, error } = await serviceClient(event).from('workspaces')
    .insert({ owner_id: user.id, brand, data: emptyData() }).select('id, brand, data').single<Workspace>()
  if (error) throw createError({ statusCode: 502, statusMessage: 'Workspace creation failed' })
  return { workspace: data }
})
