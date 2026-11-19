import type { Workspace } from '../../../shared/workspace'

export default defineEventHandler(async event => {
  const { client } = await requireUser(event)
  const { data, error } = await client.from('workspaces').select('id, brand, data').order('created_at').returns<Workspace[]>()
  if (error) throw createError({ statusCode: 502, statusMessage: 'Workspace list failed' })
  return { workspaces: data }
})
