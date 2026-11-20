import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { idSchema } from '../../../shared/workspace'

export default defineEventHandler(async event => {
  requireOrigin(event)
  const { user } = await requireUser(event)
  const config = useRuntimeConfig(event)
  const sale = saleConfig(config)
  if (!sale) throw createError({ statusCode: 503, statusMessage: 'Sales unavailable' })
  geminiSettings(event)
  const { workspaceId } = await readValidatedBody(event, z.object({ workspaceId: idSchema }).parse)
  try {
    await loadWorkspace(event, user.id, workspaceId)
  } catch (error) {
    return handleDomain(error)
  }
  const db = serviceClient(event)
  const id = randomUUID()
  const reference = randomUUID()
  const { data, error } = await db.rpc('open_groble_subscription_order', {
    p_id: id, p_owner: user.id, p_workspace: workspaceId, p_ref: reference,
    p_product: sale.product, p_option: sale.option, p_amount: sale.price,
  }).maybeSingle<{ order_id: string; seller_reference: string }>()
  if (error) throw createError({ statusCode: 502, statusMessage: 'Could not open order' })
  if (!data) throw createError({ statusCode: 409, data: { message: '이 브랜드에는 이미 구독이 연결돼 있습니다. 그로블에서 구독 상태를 확인해 주세요.' } })
  sale.checkout.searchParams.set('ref', data.seller_reference)
  setCookie(event, 'geo-pulse-order', data.order_id, { sameSite: 'lax', secure: configuredOrigin(config.siteUrl).startsWith('https:'), httpOnly: true, path: '/', maxAge: 60 * 60 * 24 })
  return { url: sale.checkout.href }
})
