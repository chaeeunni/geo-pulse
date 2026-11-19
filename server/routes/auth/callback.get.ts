export default defineEventHandler(async event => {
  setResponseHeaders(event, { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' })
  const { code, error } = getQuery(event)
  const next = safeReturn(getCookie(event, 'geo-pulse-next'))
  deleteCookie(event, 'geo-pulse-next', { path: '/auth/callback' })
  const client = sessionClient(event)
  if (!error && typeof code === 'string' && client) {
    const result = await client.auth.exchangeCodeForSession(code)
    if (!result.error) return sendRedirect(event, next, 303)
  }
  return sendRedirect(event, '/login?error=oauth&next=' + encodeURIComponent(next), 303)
})
