export default defineNuxtRouteMiddleware(async to => {
  if (import.meta.server) return
  if (to.path === '/app' && to.query.mode === 'demo') return
  const session = await useRequestFetch()('/api/auth/session')
  if (!session.user) return navigateTo({ path: '/login', query: { next: to.fullPath } })
})
