export default defineEventHandler(event => {
  const config = useRuntimeConfig(event)
  const origin = configuredOrigin(config.siteUrl)
  return { index: config.indexPublic === 'true' && Boolean(origin), origin }
})
