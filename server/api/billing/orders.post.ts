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
  const { error } = await db.from('orders').insert({
    id, owner_id: user.id, workspace_id: workspaceId, seller_reference: reference,
    product_id: sale.product, option_id: sale.option, amount: sale.price, credits: sale.credits,
  })
  if (error) throw createError({ statusCode: 502, statusMessage: 'Could not open order' })
  sale.checkout.searchParams.set('ref', reference)
  setCookie(event, 'geo-pulse-order', id, { sameSite: 'lax', secure: configuredOrigin(config.siteUrl).startsWith('https:'), httpOnly: true, path: '/', maxAge: 60 * 60 * 24 })
  return { url: sale.checkout.href }
})
