export default defineEventHandler(async event => {
  const client = sessionClient(event)
  if (!client) return { user: null, configured: false }
  const { data } = await client.auth.getUser()
  return { user: data.user ? userSummary(data.user) : null, configured: true }
})
