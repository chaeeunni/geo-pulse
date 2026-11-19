export default defineEventHandler(async event => {
  const url = getRequestURL(event)
  const path = url.pathname.replace(/\/$/, '')
  if (path !== '/app' && path !== '/billing/result') return
  if (path === '/app' && url.searchParams.get('mode') === 'demo') return
  const client = sessionClient(event)
  const { data } = client ? await client.auth.getUser() : { data: null }
  if (!data?.user) {
    setResponseHeaders(event, { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' })
    return sendRedirect(event, '/login?next=' + encodeURIComponent(path + url.search), 302)
  }
})
