import { expect, it, vi } from 'vitest'
import { requestGemini } from '../server/utils/gemini'
import { createDemo } from '../shared/demo'

it('records only actual search calls and valid citations from the Gemini answer', async () => {
  const workspace = createDemo('2026-11')[0]!
  const question = workspace.data.questions[0]!
  const answer = '라움 오디오를 비교하세요.'
  const validCitation = {
    type: 'url_citation', url: 'https://raum.example/report',
    start_index: 0, end_index: answer.length,
  }
  const provider = vi.fn()
    .mockResolvedValueOnce(Response.json({ steps: [
      { type: 'google_search_call', arguments: { queries: ['휴대용 스피커', '휴대용 스피커', '배터리 시험'] } },
      { type: 'model_output', content: [{ type: 'text', text: answer, annotations: [
        validCitation, { ...validCitation, end_index: answer.length + 1 },
      ] }] },
    ] }))
    .mockResolvedValueOnce(Response.json({ steps: [
      { type: 'google_search_call', arguments: { queries: ['분석 응답의 검색어'] } },
      { type: 'model_output', content: [{ type: 'text', text: '{"ranks":[],"format":"스펙 FAQ","quote":""}' }] },
    ] }))
  vi.stubGlobal('fetch', provider)
  try {
    const result = await requestGemini({ key: 'fixture', model: 'gemini-test' }, workspace.brand,
      { type: 'diagnose', questionId: question.id, requestId: crypto.randomUUID() }, { question }, new Date().toISOString())
    expect(result).toMatchObject({ run: {
      model: 'gemini-test', answer, searchQueries: ['휴대용 스피커', '배터리 시험'],
      citations: [{ url: validCitation.url, quote: answer }],
      observations: [{ name: '라움 오디오', official: true }, expect.any(Object), expect.any(Object)],
    } })
  } finally {
    vi.unstubAllGlobals()
  }
})
