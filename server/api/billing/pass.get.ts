import { idSchema, type SubscriptionState } from '../../../shared/workspace'

export default defineEventHandler(async event => {
  const { client, user } = await requireUser(event)
  const workspace = idSchema.safeParse(getQuery(event).workspaceId)
  if (!workspace.success) throw createError({ statusCode: 400, statusMessage: 'Invalid workspace' })
  const db = serviceClient(event)
  const [legacy, active, subscription] = await Promise.all([
    client.from('passes').select('expires_at, remaining')
      .eq('workspace_id', workspace.data).is('revoked_at', null)
      .gt('expires_at', new Date().toISOString()).order('expires_at', { ascending: false })
      .returns<{ expires_at: string; remaining: number }[]>(),
    db.rpc('active_groble_subscription', { p_owner: user.id, p_workspace: workspace.data })
      .maybeSingle<{ ends_at: string }>(),
    db.from('orders').select('subscription_state')
      .eq('owner_id', user.id).eq('workspace_id', workspace.data).eq('is_subscription', true)
      .not('subscription_started_at', 'is', null).order('created_at', { ascending: false }).limit(1)
      .maybeSingle<{ subscription_state: SubscriptionState }>(),
  ])
  if (legacy.error || active.error || subscription.error) throw createError({ statusCode: 502, statusMessage: 'Pass unavailable' })
  const passes = legacy.data
  const pass = active.data ? { expiresAt: active.data.ends_at, remaining: null } :
    passes.length ? { expiresAt: passes[0]!.expires_at, remaining: passes.reduce((sum, row) => sum + row.remaining, 0) } : null
  return { pass, subscription: subscription.data?.subscription_state ?? null }
})
