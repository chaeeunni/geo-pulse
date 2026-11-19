import { createServerClient } from '@supabase/ssr'
import { createClient, type User } from '@supabase/supabase-js'
import { getHeader, parseCookies, setCookie, type H3Event } from 'h3'
import { DomainError } from '../../shared/workspace'

export function configuredOrigin(value: string) {
  if (!value) return ''
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) ? url.origin : ''
  } catch {
    return ''
  }
}

export function safeReturn(value: unknown) {
  if (typeof value !== 'string' || !/^\/(app|pricing|billing\/result)(?:[?#]|$)/.test(value) || /[\\\r\n]/.test(value)) return '/app'
  return value
}

export function requireOrigin(event: H3Event) {
  const site = configuredOrigin(useRuntimeConfig(event).siteUrl)
  const origin = getHeader(event, 'origin')
  if (!site || origin !== site) throw createError({ statusCode: 403, statusMessage: 'Invalid origin' })
}

export function sessionClient(event: H3Event) {
  const { supabaseUrl, supabasePublishableKey, siteUrl } = useRuntimeConfig(event)
  if (!supabaseUrl || !supabasePublishableKey) return null
  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll: () => Object.entries(parseCookies(event)).map(([name, value]) => ({ name, value })),
      setAll: entries => {
        for (const { name, value, options } of entries) {
          setCookie(event, name, value, {
            ...options, httpOnly: true, sameSite: 'lax', secure: configuredOrigin(siteUrl).startsWith('https:'),
          })
        }
      },
    },
  })
}
export function serviceClient(event: H3Event) {
  const { supabaseUrl, supabaseSecretKey } = useRuntimeConfig(event)
  if (!supabaseUrl || !supabaseSecretKey) throw createError({ statusCode: 503, statusMessage: 'Database not configured' })
  return createClient(supabaseUrl, supabaseSecretKey, { auth: { persistSession: false, autoRefreshToken: false } })
}
export async function requireUser(event: H3Event) {
  const client = sessionClient(event)
  const { data } = client ? await client.auth.getUser() : { data: null }
  if (!data?.user) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  return { client: client!, user: data.user }
}
export function userSummary(user: User) {
  return { id: user.id, name: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? '내 계정') }
}
export function handleDomain(error: unknown): never {
  if (error instanceof DomainError) throw createError({ statusCode: error.status, data: { message: error.message } })
  throw error
}
