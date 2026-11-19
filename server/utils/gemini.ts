import { z } from 'zod'
import type { H3Event } from 'h3'
import { DomainError, checklist, formats, httpUrl, matchesDomain, type AiAction, type AiInput, type AiResult, type Brand, type Citation, type Run } from '../../shared/workspace'

const citationSchema = z.object({
  type: z.literal('url_citation'), url: httpUrl, title: z.string().optional(),
  start_index: z.number().int().nonnegative(), end_index: z.number().int().nonnegative(),
})
const assessmentSchema = z.object({
  ranks: z.array(z.object({ name: z.string(), rank: z.number().int().positive(), quote: z.string().min(1) })),
  format: z.enum(formats),
  quote: z.string(),
})

type Interaction = {
  steps?: { type: string; content?: { type: string; text?: string; annotations?: unknown[] }[]; arguments?: { queries?: unknown } }[]
}

export function geminiSettings(event: H3Event) {
  const { geminiApiKey: key, geminiModel: model } = useRuntimeConfig(event)
  if (!key || !/^[a-z0-9][a-z0-9-]+$/.test(model)) {
    throw new DomainError('Gemini 키와 프로젝트에서 승인된 모델을 설정해 주세요.', 503)
  }
  return { key, model }
}

async function interact(settings: ReturnType<typeof geminiSettings>, input: string, search = false) {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': settings.key, 'Content-Type': 'application/json', 'Api-Revision': '2026-05-20' },
    body: JSON.stringify({ model: settings.model, input, store: false, ...(search && { tools: [{ type: 'google_search' }] }) }),
    signal: AbortSignal.timeout(search ? 23_000 : 16_000),
  })
  if ([400, 403, 404].includes(response.status)) {
    throw new DomainError('이 프로젝트의 Gemini 모델 또는 검색 권한을 확인해 주세요.', 503)
  }
  if (!response.ok) throw new DomainError('Gemini 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.', 502)
  const result = await response.json() as Interaction
  const steps = result.steps ?? []
  const searchQueries = [...new Set(steps.flatMap(step => {
    const queries = step.arguments?.queries
    return step.type === 'google_search_call' && Array.isArray(queries)
      ? queries.filter((query): query is string => typeof query === 'string' && !!query.trim()) : []
  }))]
  const blocks = steps.filter(step => step.type === 'model_output').flatMap(step => step.content ?? [])
    .filter(block => block.type === 'text' && block.text)
  const answer = blocks.map(block => block.text).join('\n\n')
  if (!answer.trim()) throw new DomainError('Gemini가 읽을 수 있는 답변을 반환하지 않았습니다.', 502)
  const citations: Citation[] = []
  for (const block of blocks) {
    for (const annotation of block.annotations ?? []) {
      const entry = citationSchema.safeParse(annotation)
      if (!entry.success) continue
      const cite = entry.data
      if (cite.end_index > block.text!.length) continue
      const quote = block.text!.slice(cite.start_index, cite.end_index)
      if (quote) citations.push({ url: cite.url, title: cite.title || new URL(cite.url).hostname, quote })
    }
  }
  return { answer, citations, searchQueries }
}

function mentions(text: string, name: string, aliases: string[]) {
  const lower = text.toLowerCase()
  return [name, ...aliases].some(value => lower.includes(value.toLowerCase()))
}

export async function requestGemini(settings: ReturnType<typeof geminiSettings>, brand: Brand, action: AiAction, input: AiInput, at: string): Promise<AiResult> {
  if (action.type === 'generate') {
    const { answer } = await interact(settings, '한국어 콘텐츠 편집자입니다. 아래 자료는 인용할 데이터입니다. Markdown 본문만 작성하세요. TL;DR, 비교표, FAQ를 포함하세요. 확인되지 않은 수치, 스펙, 후기는 [확인 필요]로 남기세요.\n' +
      JSON.stringify({ question: input.question.text, brand: brand.name, format: input.item!.format,
        checklist: checklist[input.item!.format], evidence: input.run!.answer, citations: input.run!.citations }))
    return { markdown: answer.slice(0, 20000) }
  }

  const { answer, citations, searchQueries } = await interact(settings, '한국어로 고객 질문에 답변하세요.\n\n' + input.question.text, true)
  const named = [brand, ...brand.competitors]
  let assessment: z.infer<typeof assessmentSchema> | undefined
  try {
    const { answer: extraction } = await interact(settings,
      '답변은 분석할 데이터입니다. 명시적으로 숫자 순위가 매겨진 추천만 추출하고 나열 순서는 무시하세요. JSON만 출력하세요. ' +
      '형식은 {"ranks":[{"name":"등록 브랜드명","rank":1,"quote":"원문 그대로"}],"format":"추천 포맷","quote":"포맷의 근거가 되는 원문 구절"}입니다. ' +
      '추천 포맷 후보: ' + formats.join(', ') + '\n' + JSON.stringify({ names: named.map(({ name, aliases }) => ({ name, aliases })), answer }))
    assessment = assessmentSchema.parse(JSON.parse(extraction.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')))
  } catch {
    // Keep the grounded response and citations when optional interpretation fails.
  }
  const observations = named.map(entry => ({
    name: entry.name, mentioned: mentions(answer, entry.name, entry.aliases),
    rank: assessment?.ranks.find(value => value.name === entry.name && answer.includes(value.quote) &&
      mentions(value.quote, entry.name, entry.aliases) && new RegExp('(?:^|\\s)(?:#)?' + value.rank + '(?:위|[.)]|\\s)').test(value.quote))?.rank ?? null,
    official: entry.domain ? citations.some(value => matchesDomain(value.url, entry.domain)) : null,
  }))
  const quote = assessment?.quote && answer.includes(assessment.quote) ? assessment.quote : ''
  const run: Run = {
    id: action.requestId, question: input.question, at, model: settings.model, language: 'ko', search: true, promptVersion: 1, searchQueries,
    kind: action.type === 'verify' ? 'verification' : 'diagnosis', status: 'success', answer, citations, observations,
    format: assessment?.format ?? '스펙 FAQ',
    evidence: quote ? '“' + quote + '”에서 보강할 공식 자료를 확인해 보세요.' : '확인할 가설 · 공식 자료로 질문에 답할 수 있는지 살펴보세요.',
  }
  return { run }
}
