export default defineEventHandler(event => {
  setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
  const config = useRuntimeConfig(event)
  const origin = configuredOrigin(config.siteUrl)
  if (config.indexPublic !== 'true' || !origin) return 'User-agent: *\nDisallow: /\n'
  return 'User-agent: *\nDisallow: /app\nDisallow: /login\nDisallow: /billing/\nDisallow: /api/\nSitemap: ' + origin + '/sitemap.xml\n'
})
