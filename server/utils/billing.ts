import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

export const eventSchema = z.object({
  id: z.string().min(1).max(200), type: z.string().max(100), occurredAt: z.iso.datetime({ offset: true }),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
})
const payment = z.object({
  merchantUid: z.string().min(1).max(200),
  content: z.object({ id: z.string().min(1), paymentType: z.literal('ONE_TIME') }),
  pricing: z.object({ finalAmount: z.number().int().positive(), currency: z.literal('KRW') }),
  payment: z.object({ purchasedAt: z.iso.datetime({ offset: true }) }),
})

export const completionSchema = payment.extend({
  sellerReference: z.string().min(1).max(128).optional(),
  options: z.array(z.object({ optionId: z.string().min(1), quantity: z.number().int() })).length(1),
})
export const refundSchema = payment.extend({
  refund: z.object({ amount: z.number().int().positive(), currency: z.literal('KRW'), refundedAt: z.iso.datetime({ offset: true }) }),
})

export function validGrobleSignature(raw: Buffer, timestamp: string, now: number, candidates: [string, string][]) {
  if (!/^\d{10}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false
  return candidates.some(([secret, signature]) => {
    if (!secret || !/^[0-9a-f]{64}$/i.test(signature)) return false
    const expected = createHmac('sha256', secret).update(timestamp + '.').update(raw).digest()
    return timingSafeEqual(expected, Buffer.from(signature, 'hex'))
  })
}

export function saleConfig(config: {
  grobleCheckoutUrl: string; grobleProductId: string; grobleOptionId: string; grobleWebhookSecret: string
  passPrice: string; passCredits: string; refundTerms: string
}) {
  const price = Number(config.passPrice)
  const credits = Number(config.passCredits)
  try {
    const checkout = new URL(config.grobleCheckoutUrl)
    if (checkout.protocol !== 'https:' || checkout.username || checkout.password ||
      !['groble.im', 'www.groble.im'].includes(checkout.hostname) || !checkout.pathname.startsWith('/payment/') ||
      !config.grobleProductId || !config.grobleOptionId || !config.grobleWebhookSecret ||
      !Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(credits) || credits <= 0 || !config.refundTerms.trim()) return null
    return { checkout, product: config.grobleProductId, option: config.grobleOptionId, price, credits, refundTerms: config.refundTerms }
  } catch {
    return null
  }
}
