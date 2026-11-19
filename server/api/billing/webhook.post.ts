export default defineEventHandler(async event => {
  const { grobleWebhookSecret, groblePreviousSecret } = useRuntimeConfig(event)
  if (!grobleWebhookSecret) throw createError({ statusCode: 503, statusMessage: 'Webhook not configured' })
  const raw = await readRawBody(event, false)
  if (!raw || raw.length > 256_000) throw createError({ statusCode: 400, statusMessage: 'Invalid body' })
  const timestamp = getHeader(event, 'x-groble-timestamp') ?? ''
  const signature = getHeader(event, 'x-groble-signature') ?? ''
  const previous = getHeader(event, 'x-groble-signature-previous') ?? ''
  if (!validGrobleSignature(raw, timestamp, Date.now(), [
    [grobleWebhookSecret, signature], [groblePreviousSecret, previous],
  ])) throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })

  const delivery = getHeader(event, 'x-groble-idempotency-key')
  if (!delivery || delivery.length > 200) throw createError({ statusCode: 400, statusMessage: 'Invalid delivery key' })
  let value: unknown
  try { value = JSON.parse(raw.toString('utf8')) } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' })
  }
  const envelope = eventSchema.safeParse(value)
  if (!envelope.success) throw createError({ statusCode: 400, statusMessage: 'Invalid event' })
  const { id, type, occurredAt, data } = envelope.data
  if (type !== 'payment.completed' && type !== 'payment.refunded') return { received: true }
  const payment = type === 'payment.completed' ? completionSchema.safeParse(data.object) : refundSchema.safeParse(data.object)
  if (!payment.success) throw createError({ statusCode: 400, statusMessage: 'Invalid payment event' })
  const body = payment.data
  const { error } = await serviceClient(event).rpc('handle_groble_event', {
    p_event: id, p_delivery: delivery, p_type: type, p_merchant: body.merchantUid, p_occurred: occurredAt,
    p_ref: 'options' in body ? body.sellerReference ?? null : null,
    p_product: body.content.id, p_option: 'options' in body && body.options[0]?.quantity === 1 ? body.options[0].optionId : null,
    p_amount: body.pricing.finalAmount, p_purchased: body.payment.purchasedAt,
    p_refund_amount: 'refund' in body ? body.refund.amount : null,
    p_refunded: 'refund' in body ? body.refund.refundedAt : null,
  })
  if (error) throw createError({ statusCode: 502, statusMessage: 'Event storage failed' })
  return { received: true }
})
