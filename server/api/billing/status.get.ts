import { idSchema } from '../../../shared/workspace'

export default defineEventHandler(async event => {
  const { client, user } = await requireUser(event)
  const id = idSchema.safeParse(getCookie(event, 'geo-pulse-order'))
  let query = client.from('orders').select('id, status, workspace_id, is_subscription').order('created_at', { ascending: false }).limit(1)
  if (id.success) query = query.eq('id', id.data)
  const { data, error } = await query.maybeSingle<{ id: string; status: string; workspace_id: string; is_subscription: boolean }>()
  if (error) throw createError({ statusCode: 502, statusMessage: 'Payment status unavailable' })
  let status = data?.status ?? 'missing'
  if (data?.is_subscription && status === 'paid') {
    const { data: active, error: activeError } = await serviceClient(event).rpc('active_groble_subscription', {
      p_owner: user.id, p_workspace: data.workspace_id, p_order: data.id,
    }).maybeSingle()
    if (activeError) throw createError({ statusCode: 502, statusMessage: 'Payment status unavailable' })
    if (!active) status = 'expired'
  }
  return { status, workspaceId: data?.workspace_id ?? null }
})
