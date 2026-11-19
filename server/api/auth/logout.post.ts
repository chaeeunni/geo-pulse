export default defineEventHandler(async event => {
  requireOrigin(event)
  const client = sessionClient(event)
  const result = await client?.auth.signOut({ scope: 'local' })
  if (result?.error && result.error.name !== 'AuthSessionMissingError') {
    throw createError({ statusCode: 502, statusMessage: 'Sign out failed' })
  }
  return { ok: true }
})
