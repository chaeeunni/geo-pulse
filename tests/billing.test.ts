import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { completionSchema, refundSchema, saleConfig, validGrobleSignature } from '../server/utils/billing'

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
    const config = { grobleCheckoutUrl: 'https://groble.im/payment/test', grobleProductId: 'product', grobleOptionId: 'option',
      grobleWebhookSecret: 'test', passPrice: '10000', passCredits: '20', refundTerms: 'Test terms' }
    expect(saleConfig(config)).toMatchObject({ price: 10000, credits: 20 })
    expect(saleConfig({ ...config, passPrice: '' })).toBeNull()
    expect(saleConfig({ ...config, grobleCheckoutUrl: 'https://elsewhere.example/payment/test' })).toBeNull()
  })
})
