import { idSchema } from '../../../shared/workspace'

export default defineEventHandler(async event => {
  const { client } = await requireUser(event)
  const id = idSchema.safeParse(getCookie(event, 'geo-pulse-order'))
  let query = client.from('orders').select('status, workspace_id').order('created_at', { ascending: false }).limit(1)
  if (id.success) query = query.eq('id', id.data)
  const { data, error } = await query.maybeSingle<{ status: string; workspace_id: string }>()
  if (error) throw createError({ statusCode: 502, statusMessage: 'Payment status unavailable' })
  return { status: data?.status ?? 'missing', workspaceId: data?.workspace_id ?? null }
})
