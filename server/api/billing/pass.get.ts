import { idSchema } from '../../../shared/workspace'

export default defineEventHandler(async event => {
  const { client } = await requireUser(event)
  const workspace = idSchema.safeParse(getQuery(event).workspaceId)
  if (!workspace.success) throw createError({ statusCode: 400, statusMessage: 'Invalid workspace' })
  const { data, error } = await client.from('passes').select('expires_at, remaining')
    .eq('workspace_id', workspace.data).is('revoked_at', null)
    .gt('expires_at', new Date().toISOString()).order('expires_at', { ascending: false }).returns<{ expires_at: string; remaining: number }[]>()
  if (error) throw createError({ statusCode: 502, statusMessage: 'Pass unavailable' })
  return { pass: data.length ? { expiresAt: data[0]!.expires_at, remaining: data.reduce((sum, row) => sum + row.remaining, 0) } : null }
})
