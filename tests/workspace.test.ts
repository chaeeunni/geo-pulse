import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createDemo, runDemo } from '../shared/demo'
import { actionSchema, aggregate, brandSchema, change, emptyData, isComparable, kstMonth, matchesDomain, monthlyRuns, newCitations, score } from '../shared/workspace'

const month = '2026-11'
const publication = '2026-11-19T05:00:00.000Z'
const after = '2026-11-19T05:01:00.000Z'
const url = 'https://raum.example/report'

describe('GEO Pulse workspace', () => {
  it('accepts website URLs and bare domains for brand and competitors', () => {
    const brand = {
      name: '리딩앤', category: '영어 학습', aliases: [],
      domain: ' https://www.readingn.com/ ',
      competitors: [
        { name: '도도', domain: 'https://gohidodo.com/', aliases: [] },
        { name: '빈 주소', domain: ' ', aliases: [] },
      ],
    }
    const result = brandSchema.parse(brand)
    expect(result.domain).toBe('readingn.com')
    expect(result.competitors.map(entry => entry.domain)).toEqual(['gohidodo.com', ''])
    expect(brandSchema.parse({ ...brand, domain: 'readingn.com' }).domain).toBe(result.domain)
    expect(brandSchema.safeParse({ ...brand, domain: 'https://readingn.com@gohidodo.com/' }).success).toBe(false)
    expect(matchesDomain('https://readingn.com/home', 'www.readingn.com')).toBe(true)
  })

  it('keeps each demo isolated and gives a new workspace an empty state', () => {
    const [first, second] = createDemo(month)
    expect(first!.brand.name).toBe('라움 오디오')
    expect(second!.brand.name).toBe('클라우드노트')
    change(first!.data, { type: 'saveQuestion', text: 'Test only in Raoom', stage: '탐색', priority: 2 }, randomUUID(), after)
    expect(second!.data.questions.some(question => question.text === 'Test only in Raoom')).toBe(false)
    expect(emptyData()).toEqual({ questions: [], runs: [], items: [], verifications: [] })
  })

  it('calculates KPI denominators and explicit ranks from the PRD sample', () => {
    const [workspace] = createDemo(month)
    expect(aggregate(monthlyRuns(workspace!.data, month), workspace!.brand.name)).toMatchObject({
      mentionRate: 60, citationRate: 40, averageRank: 2, observations: 5, rankCount: 2,
    })
    expect(aggregate([], workspace!.brand.name).mentionRate).toBeNull()
    expect(kstMonth('2026-10-31T15:00:00Z')).toBe(month)
    expect(matchesDomain('https://spec.raum.example/document', 'raum.example')).toBe(true)
    expect(matchesDomain('https://fake-raum.example/document', 'raum.example')).toBe(false)
  })

  it('deduplicates items and preserves publication time when the same URL is saved again', () => {
    const [workspace] = createDemo(month)
    const { data } = workspace!
    const item = data.items[0]!
    change(data, { type: 'addItem', runId: item.runId, month }, randomUUID(), publication)
    expect(data.items).toHaveLength(1)
    change(data, { type: 'publish', itemId: item.id, url: url + '?utm_source=sample' }, randomUUID(), publication)
    change(data, { type: 'publish', itemId: item.id, url: url + '#steps' }, randomUUID(), after)
    expect(item.publication).toEqual({ url, at: publication, beforeId: item.runId })
  })

  it('returns validation errors for malformed and non-web publication URLs', () => {
    for (const invalid of ['not a URL', 'javascript:alert(1)', 'https://user:pass@raum.example']) {
      expect(actionSchema.safeParse({ type: 'publish', itemId: randomUUID(), url: invalid }).success).toBe(false)
    }
  })

  it('preserves drafts when regenerating and applies only the newest comparable result once', () => {
    const [workspace] = createDemo(month)
    const { data, brand } = workspace!
    const item = data.items[0]!
    change(data, { type: 'saveDraft', itemId: item.id, markdown: '내 편집본' }, randomUUID(), publication)
    runDemo(workspace!, { type: 'generate', itemId: item.id, requestId: randomUUID() }, after)
    expect(item.draft).toBe('내 편집본')
    expect(item.generatedDraft).toContain('TL;DR')
    change(data, { type: 'publish', itemId: item.id, url }, randomUUID(), publication)
    const older = randomUUID()
    const latest = randomUUID()
    runDemo(workspace!, { type: 'verify', itemId: item.id, requestId: older }, after)
    runDemo(workspace!, { type: 'verify', itemId: item.id, requestId: latest }, '2026-11-19T05:02:00.000Z')
    expect(aggregate(monthlyRuns(data, month), brand.name).citationRate).toBe(40)
    const beforeRun = data.runs.find(run => run.id === item.runId)!
    const afterRun = data.runs.find(run => run.id === latest)!
    expect(score(afterRun, brand.name) - score(beforeRun, brand.name)).toBe(2)
    expect(isComparable(beforeRun, { ...afterRun, model: 'other-model' })).toBe(false)
    expect(newCitations(beforeRun, afterRun)).toHaveLength(1)
    change(data, { type: 'apply', verificationId: latest }, randomUUID(), after)
    change(data, { type: 'apply', verificationId: latest }, randomUUID(), after)
    expect(() => change(data, { type: 'apply', verificationId: older }, randomUUID(), after)).toThrow('더 최근')
    expect(aggregate(monthlyRuns(data, month), brand.name)).toMatchObject({ citationRate: 60, observations: 5 })
  })
})
