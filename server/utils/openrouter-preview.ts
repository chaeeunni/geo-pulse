export function diagnosisOrigin(host: string, development: boolean, vercelEnv?: string, deploymentHost?: string) {
  if (development && /^(localhost|127\.0\.0\.1):\d+$/.test(host)) return 'http://' + host
  if (vercelEnv === 'preview' && host === deploymentHost && /^geo-pulse-staging-[a-z0-9-]+\.vercel\.app$/.test(host)) {
    return 'https://' + host
  }
  return null
}
