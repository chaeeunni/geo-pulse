import { expect, it } from 'vitest'
import { diagnosisOrigin } from '../server/utils/openrouter-preview'

it('permits only loopback development and the exact staging Preview deployment host', () => {
  const preview = 'geo-pulse-staging-test-chaeeun11.vercel.app'
  expect(diagnosisOrigin('127.0.0.1:3050', true)).toBe('http://127.0.0.1:3050')
  expect(diagnosisOrigin(preview, false, 'preview', preview)).toBe('https://' + preview)
  expect(diagnosisOrigin(preview, false, 'production', preview)).toBeNull()
  expect(diagnosisOrigin('geo-pulse-staging.vercel.app', false, 'preview', preview)).toBeNull()
  expect(diagnosisOrigin('example.org:3050', true)).toBeNull()
})
