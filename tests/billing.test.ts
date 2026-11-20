import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { completionSchema, refundSchema, saleConfig, subscriptionNoticeSchema, validGrobleSignature } from '../server/utils/billing'

const now = 1795075200000
const timestamp = String(now / 1000)
const secret = 'fixture-only'
const body = Buffer.from('{"type": "payment.completed"}')
const signature = createHmac('sha256', secret).update(timestamp + '.').update(body).digest('hex')

describe('Groble webhook', () => {
  it('checks the timestamp and exact raw body, with rotation support', () => {
    expect(validGrobleSignature(body, timestamp, now, [[secret, signature]])).toBe(true)
    expect(validGrobleSignature(body, timestamp, now, [['new-key', ''], [secret, signature]])).toBe(true)
    expect(validGrobleSignature(body, timestamp, now + 301000, [[secret, signature]])).toBe(false)
    expect(validGrobleSignature(Buffer.from('{"type":"payment.completed"}'), timestamp, now, [[secret, signature]])).toBe(false)
  })

  it('validates KRW and accepts a refund with the original transaction but no seller reference', () => {
    const initial = { merchantUid: 'merchant-test', content: { id: 'product', paymentType: 'ONE_TIME' },
      pricing: { finalAmount: 10000, currency: 'KRW' }, payment: { purchasedAt: '2026-11-19T14:00:00+09:00' } }
    const complete = { ...initial, sellerReference: 'ref-test', options: [{ optionId: 'option', quantity: 1 }] }
    expect(completionSchema.safeParse(complete).success).toBe(true)
    expect(completionSchema.safeParse({ ...complete, pricing: { finalAmount: 0, currency: 'KRW' } }).success).toBe(false)
    expect(refundSchema.safeParse({ ...initial, refund: { amount: 10000, currency: 'KRW', refundedAt: '2026-11-19T14:05:00+09:00' } }).success).toBe(true)
  })

  it('enables a sale only after the offer is configured and hosted on Groble', () => {
    const config = { grobleSubscriptionCheckoutUrl: 'https://groble.im/payment/test', grobleSubscriptionProductId: 'product', grobleSubscriptionOptionId: 'option',
      grobleWebhookSecret: 'test', passPrice: '3800', refundTerms: 'Test terms' }
    expect(saleConfig(config)).toMatchObject({ price: 3800, product: 'product', option: 'option' })
    expect(saleConfig({ ...config, passPrice: '' })).toBeNull()
    expect(saleConfig({ ...config, grobleSubscriptionCheckoutUrl: 'https://elsewhere.example/payment/test' })).toBeNull()
    expect(saleConfig({ ...config, grobleSubscriptionOptionId: '' })).toBeNull()
  })
})

describe('Groble subscription notices', () => {
  const activatedAt = '2026-10-19T14:00:00+09:00'
  const purchasedAt = '2026-11-19T14:00:00+09:00'
  const common = {
    merchantUid: 'renewal-2',
    sellerReference: 'subscription-reference',
    content: { id: 'product', paymentType: 'SUBSCRIPTION' },
    options: [{ optionId: 'monthly', quantity: 1 }],
    pricing: { finalAmount: 3800, currency: 'KRW' },
    subscription: { activatedAt, billingCycleMonths: 1 },
  }

  it('requires a valid next billing date and an explicit subscription type for completed charges', () => {
    const body = {
      ...common, payment: { purchasedAt },
      subscription: { ...common.subscription, billingReason: 'RENEWAL', currentRound: 2, nextBillingDate: '2026-12-19' },
    }
    const type = 'subscription_payment.completed'
    expect(subscriptionNoticeSchema.safeParse({ type, body }).success).toBe(true)
    expect(subscriptionNoticeSchema.safeParse({ type, body: { ...body, content: { ...body.content, paymentType: 'ONE_TIME' } } }).success).toBe(false)
    expect(subscriptionNoticeSchema.safeParse({
      type, body: { ...body, subscription: { ...body.subscription, nextBillingDate: '2026-11-31' } },
    }).success).toBe(false)
    expect(subscriptionNoticeSchema.safeParse({ type, body: { ...body, options: [{ optionId: 'monthly', quantity: 2 }] } }).success).toBe(false)
  })

  it('accepts status-only events and matches refunds without seller references', () => {
    const body = {
      ...common, sellerReference: undefined, payment: { purchasedAt },
      subscription: { ...common.subscription, refundedRound: 2 },
      refund: { amount: 1900, currency: 'KRW', refundedAt: '2026-11-19T14:05:00+09:00' },
    }
    expect(subscriptionNoticeSchema.safeParse({ type: 'subscription_payment.refunded', body }).success).toBe(true)
    expect(subscriptionNoticeSchema.safeParse({ type: 'subscription_payment.failed', body: common }).success).toBe(true)
    expect(subscriptionNoticeSchema.safeParse({ type: 'subscription.cancel_requested', body: common }).success).toBe(true)
    expect(subscriptionNoticeSchema.safeParse({
      type: 'subscription.terminated', body: { ...common, termination: { terminatedAt: purchasedAt } },
    }).success).toBe(true)
    expect(subscriptionNoticeSchema.safeParse({ type: 'subscription.terminated', body: common }).success).toBe(false)
  })
})
