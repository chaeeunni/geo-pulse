export default defineEventHandler(event => {
  const config = useRuntimeConfig(event)
  const product = saleConfig(config)
  return {
    available: Boolean(product && configuredOrigin(config.siteUrl) && config.supabaseUrl && config.supabasePublishableKey && config.supabaseSecretKey && config.geminiApiKey),
    price: product?.price ?? null, credits: product?.credits ?? null, refundTerms: product?.refundTerms ?? null,
  }
})
