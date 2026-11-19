export default defineEventHandler(event => {
  const config = useRuntimeConfig(event)
  const origin = configuredOrigin(config.siteUrl)
  if (config.indexPublic !== 'true' || !origin) throw createError({ statusCode: 404 })
  setResponseHeader(event, 'content-type', 'application/xml; charset=utf-8')
  const urls = ['/', '/pricing'].map(path => '<url><loc>' + origin + path + '</loc></url>').join('')
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls + '</urlset>'
})
