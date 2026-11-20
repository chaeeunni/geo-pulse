import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

export const eventSchema = z.object({
  id: z.string().min(1).max(200), type: z.string().max(100), occurredAt: z.iso.datetime({ offset: true }),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
})
const transaction = z.object({
  merchantUid: z.string().min(1).max(200),
  pricing: z.object({ finalAmount: z.number().int().positive(), currency: z.literal('KRW') }),
})
const paymentTime = z.object({ purchasedAt: z.iso.datetime({ offset: true }) })
const refund = z.object({ amount: z.number().int().positive(), currency: z.literal('KRW'), refundedAt: z.iso.datetime({ offset: true }) })
const payment = transaction.extend({
  content: z.object({ id: z.string().min(1), paymentType: z.literal('ONE_TIME') }),
  payment: paymentTime,
})

export const completionSchema = payment.extend({
  sellerReference: z.string().min(1).max(128).optional(),
  options: z.array(z.object({ optionId: z.string().min(1), quantity: z.number().int() })).length(1),
})
export const refundSchema = payment.extend({ refund })

const subscriptionPeriod = z.object({
  activatedAt: z.iso.datetime({ offset: true }),
  billingCycleMonths: z.number().int().min(1).max(12),
})
const round = z.number().int().positive()
const recurring = transaction.extend({
  content: z.object({ id: z.string().min(1), paymentType: z.literal('SUBSCRIPTION') }),
  options: z.tuple([z.object({ optionId: z.string().min(1), quantity: z.literal(1) })]),
  sellerReference: z.string().min(1).max(128).optional(),
})

export const subscriptionNoticeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('subscription_payment.completed'),
    body: recurring.extend({
      payment: paymentTime,
      subscription: subscriptionPeriod.extend({
        billingReason: z.enum(['INITIAL', 'RENEWAL']),
        currentRound: round,
        nextBillingDate: z.iso.date(),
      }).refine(value => (value.billingReason === 'INITIAL') === (value.currentRound === 1)),
    }),
  }),
  z.object({
    type: z.literal('subscription_payment.refunded'),
    body: recurring.extend({ payment: paymentTime, refund, subscription: subscriptionPeriod.extend({ refundedRound: round }) }),
  }),
  z.object({ type: z.literal('subscription_payment.failed'), body: recurring.extend({ subscription: subscriptionPeriod }) }),
  z.object({ type: z.literal('subscription.cancel_requested'), body: recurring.extend({ subscription: subscriptionPeriod }) }),
  z.object({
    type: z.literal('subscription.terminated'),
    body: recurring.extend({
      subscription: subscriptionPeriod,
      termination: z.object({ terminatedAt: z.iso.datetime({ offset: true }) }),
    }),
  }),
])

export function isSubscriptionNotice(type: string) {
  return type === 'subscription_payment.completed' || type === 'subscription_payment.refunded' ||
    type === 'subscription_payment.failed' || type === 'subscription.cancel_requested' || type === 'subscription.terminated'
}

export function validGrobleSignature(raw: Buffer, timestamp: string, now: number, candidates: [string, string][]) {
  if (!/^\d{10}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false
  return candidates.some(([secret, signature]) => {
    if (!secret || !/^[0-9a-f]{64}$/i.test(signature)) return false
    const expected = createHmac('sha256', secret).update(timestamp + '.').update(raw).digest()
    return timingSafeEqual(expected, Buffer.from(signature, 'hex'))
  })
}

export function saleConfig(config: {
  grobleSubscriptionCheckoutUrl: string; grobleSubscriptionProductId: string; grobleSubscriptionOptionId: string
  grobleWebhookSecret: string; passPrice: string; refundTerms: string
}) {
  const price = Number(config.passPrice)
  try {
    const checkout = new URL(config.grobleSubscriptionCheckoutUrl)
    if (checkout.protocol !== 'https:' || checkout.username || checkout.password ||
      !['groble.im', 'www.groble.im'].includes(checkout.hostname) || !checkout.pathname.startsWith('/payment/') ||
      !config.grobleSubscriptionProductId.trim() || !config.grobleSubscriptionOptionId.trim() || !config.grobleWebhookSecret ||
      !Number.isSafeInteger(price) || price <= 0 || !config.refundTerms.trim()) return null
    return { checkout, product: config.grobleSubscriptionProductId.trim(), option: config.grobleSubscriptionOptionId.trim(), price, refundTerms: config.refundTerms.trim() }
  } catch {
    return null
  }
}
