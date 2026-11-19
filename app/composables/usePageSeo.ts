export function usePageSeo(path: string, title: string, description: string) {
  const request = useFetch('/api/seo', { key: 'site-seo' })
  const { data } = request
  useSeoMeta({ title, description, ogTitle: title + ' | GEO Pulse', ogDescription: description,
    robots: () => data.value?.index ? 'index, follow' : 'noindex, nofollow' })
  useHead(() => ({ link: data.value?.index ? [{ rel: 'canonical', href: data.value.origin + path }] : [] }))
  return request
}
