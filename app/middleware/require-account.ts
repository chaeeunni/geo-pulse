export default defineNuxtRouteMiddleware(async to => {
  if (to.path === '/app' && to.query.mode === 'demo') return
  const response = await useRequestFetch().raw('/api/auth/session')
  if (import.meta.server) {
    const cookies = response.headers.getSetCookie()
    if (cookies.length) useResponseHeader('set-cookie').value = cookies
  }
  if (!response._data?.user) return navigateTo({ path: '/login', query: { next: to.fullPath } })
})
