import { z } from 'zod'
import { brandSchema, httpUrl, matchesDomain } from '../../../shared/workspace'

const input = z.object({
  question: z.string().trim().min(3).max(1000),
  brand: z.string().trim().min(1).max(120),
  domain: brandSchema.shape.domain,
})
const result = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({ message: z.object({
    content: z.string().nullable(),
    annotations: z.array(z.unknown()).optional(),
  }) })),
})
const annotation = z.object({
  type: z.literal('url_citation'),
  url_citation: z.object({
    url: httpUrl,
    title: z.string().optional(),
    start_index: z.number().int().nonnegative().optional(),
    end_index: z.number().int().nonnegative().optional(),
  }),
})

export default defineEventHandler(async event => {
  const origin = diagnosisOrigin(getHeader(event, 'host') ?? '', import.meta.dev, process.env.VERCEL_ENV, process.env.VERCEL_URL)
  if (!origin) throw createError({ statusCode: 404 })
  if (getHeader(event, 'origin') !== origin || getHeader(event, 'content-type')?.split(';')[0] !== 'application/json') {
    throw createError({ statusCode: 403 })
  }

  const { openrouterApiKey, openrouterModel } = useRuntimeConfig(event)
  if (!openrouterApiKey.trim()) throw createError({ statusCode: 503, data: { message: '서버에 OpenRouter 키가 설정되지 않았습니다.' } })
  const { question, brand, domain } = await readValidatedBody(event, input.parse)
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + openrouterApiKey.trim(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: openrouterModel,
      max_tokens: 1250,
      reasoning: { effort: 'low' },
      tools: [{ type: 'openrouter:web_search', parameters: { engine: 'exa', max_uses: 1, max_results: 4 } }],
      messages: [
        { role: 'system', content: '웹 검색 도구를 사용해 고객 질문에 한국어로 간결하게 답하세요. 근거를 확인할 수 없는 사실은 확인되지 않았다고 표시하세요.' },
        { role: 'user', content: question },
      ],
    }),
    signal: AbortSignal.timeout(55_000),
  }).catch(() => {
    throw createError({ statusCode: 502, data: { message: 'OpenRouter에 연결할 수 없거나 응답 시간이 초과됐습니다.' } })
  })
  if (!response.ok) {
    const message = response.status === 401 ? 'OpenRouter 키를 확인해 주세요.' :
      response.status === 402 ? 'OpenRouter 크레딧이 부족합니다.' :
      response.status === 429 ? 'OpenRouter 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.' :
      'OpenRouter 요청이 실패했습니다. 응답 코드 ' + response.status
    throw createError({ statusCode: 502, data: { message } })
  }
  const parsed = result.safeParse(await response.json().catch(() => null))
  const message = parsed.success ? parsed.data.choices[0]?.message : undefined
  if (!parsed.success || !message?.content?.trim()) {
    throw createError({ statusCode: 502, data: { message: 'OpenRouter가 표시할 수 있는 답변을 반환하지 않았습니다.' } })
  }
  const answer = message.content
  const citations = (message.annotations ?? []).flatMap(value => {
    const parsed = annotation.safeParse(value)
    if (!parsed.success) return []
    const { url, title, start_index, end_index } = parsed.data.url_citation
    const quote = start_index !== undefined && end_index !== undefined && end_index <= answer.length
      ? answer.slice(start_index, end_index) : ''
    return [{ url, title: title || new URL(url).hostname, quote }]
  })
  return {
    answer,
    model: parsed.data.model || openrouterModel,
    citations,
    mentioned: answer.toLowerCase().includes(brand.toLowerCase()),
    official: new Set(citations.filter(citation => matchesDomain(citation.url, domain)).map(citation => citation.url)).size,
  }
})
