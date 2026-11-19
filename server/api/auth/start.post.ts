import { z } from 'zod'

export default defineEventHandler(async event => {
  requireOrigin(event)
  const { provider, next } = await readValidatedBody(event, z.object({
    provider: z.enum(['kakao', 'google']), next: z.string().optional(),
  }).parse)
  const client = sessionClient(event)
  const site = configuredOrigin(useRuntimeConfig(event).siteUrl)
  if (!site || !client) throw createError({ statusCode: 503, statusMessage: 'OAuth not configured' })
  const callback = new URL('/auth/callback', site)
  const { data, error } = await client.auth.signInWithOAuth({
    provider, options: { redirectTo: callback.href, skipBrowserRedirect: true },
  })
  if (error || !data.url) throw createError({ statusCode: 502, statusMessage: 'OAuth start failed' })
  setCookie(event, 'geo-pulse-next', safeReturn(next), {
    path: '/auth/callback', sameSite: 'lax', httpOnly: true,
    secure: site.startsWith('https:'), maxAge: 600,
  })
  return { url: data.url }
})
