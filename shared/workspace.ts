import { z } from 'zod'

export const stages = ['탐색', '비교', '결정'] as const
export const formats = ['비교 매트릭스', '스펙 FAQ', '실사용 리포트', '리뷰 시딩 가이드'] as const
const label = z.string().trim().min(1).max(120)
const domain = z.string().trim().toLowerCase().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]{2,63}$/)
export const brandSchema = z.object({
  name: label, category: label, domain,
  aliases: z.array(label).max(10),
  competitors: z.array(z.object({ name: label, domain: domain.or(z.literal('')), aliases: z.array(label).max(10) })).max(6),
})
export const httpUrl = z.url().max(2048).refine(value => {
  const url = new URL(value)
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
})
export const idSchema = z.uuid()
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('saveQuestion'), id: idSchema.optional(), text: z.string().trim().min(3).max(1000), stage: z.enum(stages), priority: z.number().int().min(1).max(3) }),
  z.object({ type: z.literal('addItem'), runId: idSchema, month: monthSchema }),
  z.object({ type: z.literal('saveDraft'), itemId: idSchema, markdown: z.string().max(20000) }),
  z.object({ type: z.literal('publish'), itemId: idSchema, url: httpUrl }),
  z.object({ type: z.literal('apply'), verificationId: idSchema }),
  z.object({ type: z.literal('diagnose'), questionId: idSchema, requestId: idSchema }),
  z.object({ type: z.literal('generate'), itemId: idSchema, requestId: idSchema }),
  z.object({ type: z.literal('verify'), itemId: idSchema, requestId: idSchema }),
])

export type Brand = z.infer<typeof brandSchema>
export type Action = z.infer<typeof actionSchema>
export type AiAction = Extract<Action, { requestId: string }>
export type Question = { id: string; version: number; text: string; stage: typeof stages[number]; priority: number }
export type Citation = { url: string; title: string; quote: string }
export type Observation = { name: string; mentioned: boolean; rank: number | null; official: boolean | null }
export type Run = {
  id: string; question: Question; at: string; model: string; language: string; search: boolean; promptVersion: number
  status: 'success' | 'error'; answer: string; citations: Citation[]; observations: Observation[]
  format: typeof formats[number]; evidence: string; error?: string; kind: 'diagnosis' | 'verification'
}
export type Item = {
  id: string; month: string; runId: string; title: string; format: Run['format']; reason: string
  draft: string; generatedDraft: string; publication?: { url: string; at: string; beforeId: string | null }
}
export type Verification = { id: string; itemId: string; beforeId: string | null; afterId: string; appliedAt?: string }
export type WorkspaceData = { questions: Question[]; runs: Run[]; items: Item[]; verifications: Verification[] }
export type Workspace = { id: string; brand: Brand; data: WorkspaceData }
export type Pass = { expiresAt: string; remaining: number }

export const emptyData = (): WorkspaceData => ({ questions: [], runs: [], items: [], verifications: [] })
export const checklist: Record<Run['format'], string[]> = {
  '비교 매트릭스': ['비교 제품의 공식 스펙', '같은 조건의 비교 기준', '스펙 확인 날짜와 출처'],
  '스펙 FAQ': ['공식 제품 정보', '반복되는 고객 질문', '답변별 원문 출처'],
  '실사용 리포트': ['실사용 시험 조건', '측정값과 반복 횟수', '원본 사진 또는 기록'],
  '리뷰 시딩 가이드': ['대상 제품과 리뷰 범위', '독립적인 평가 기준', '협찬 표시 기준과 공개 링크'],
}
export class DomainError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export function kstMonth(value: string | Date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date(value))
}
export function monthsEndingAt(month: string) {
  const [year, index] = month.split('-').map(Number)
  return Array.from({ length: 6 }, (_, offset) =>
    new Date(Date.UTC(year!, index! - 6 + offset, 1)).toISOString().slice(0, 7))
}
export function normalizeUrl(value: string) {
  const url = new URL(value)
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_|^(gclid|fbclid|msclkid)$/i.test(key)) url.searchParams.delete(key)
  }
  url.searchParams.sort()
  return url.toString()
}
export function matchesDomain(url: string, domain: string) {
  if (!domain) return false
  const host = new URL(url).hostname.toLowerCase()
  return host === domain || host.endsWith('.' + domain)
}
export function isComparable(a: Run, b: Run) {
  return a.question.id === b.question.id && a.question.version === b.question.version &&
    a.model === b.model && a.language === b.language && a.search === b.search && a.promptVersion === b.promptVersion
}
export function newest<T extends { at: string }>(values: T[]) {
  return values.toSorted((a, b) => b.at.localeCompare(a.at))[0]
}
export function requireItem(store: WorkspaceData, id: string) {
  const item = store.items.find(entry => entry.id === id)
  if (!item) throw new DomainError('안건을 찾을 수 없습니다.', 404)
  return item
}
export function requireRun(store: WorkspaceData, id: string) {
  const run = store.runs.find(entry => entry.id === id)
  if (!run) throw new DomainError('진단 기록을 찾을 수 없습니다.', 404)
  return run
}
export function aiInput(store: WorkspaceData, action: AiAction) {
  if (action.type === 'diagnose') {
    const question = store.questions.find(entry => entry.id === action.questionId)
    if (!question) throw new DomainError('질문을 찾을 수 없습니다.', 404)
    return { question }
  }
  const item = requireItem(store, action.itemId)
  const run = requireRun(store, item.runId)
  if (action.type === 'verify' && !item.publication) throw new DomainError('발행 URL을 먼저 등록해 주세요.')
  return { item, run, question: run.question }
}
export type AiInput = ReturnType<typeof aiInput>
export type AiResult = { run: Run } | { markdown: string }

export function applyAi(store: WorkspaceData, action: AiAction, input: AiInput, result: AiResult) {
  if (action.type === 'generate' && 'markdown' in result) {
    const item = requireItem(store, action.itemId)
    if (item.generatedDraft !== input.item?.generatedDraft) return
    item.generatedDraft = result.markdown
  }
  if ('run' in result && !store.runs.some(run => run.id === result.run.id)) {
    store.runs.push(result.run)
    if (action.type === 'verify' && result.run.status === 'success') {
      const publication = input.item?.publication
      const item = requireItem(store, action.itemId)
      if (!publication || item.publication?.at !== publication.at || item.publication.url !== publication.url) return
      store.verifications.push({ id: result.run.id, itemId: item.id, beforeId: publication.beforeId, afterId: result.run.id })
    }
  }
}

export function change(store: WorkspaceData, action: Exclude<Action, AiAction>, id: string, now: string) {
  switch (action.type) {
    case 'saveQuestion': {
      const old = store.questions.find(question => question.id === action.id)
      if (action.id && !old) throw new DomainError('질문을 찾을 수 없습니다.', 404)
      const values = { text: action.text, stage: action.stage, priority: action.priority }
      if (old) {
        if (old.text !== action.text) old.version += 1
        Object.assign(old, values)
      } else store.questions.push({ id, version: 1, ...values })
      break
    }
    case 'addItem': {
      const run = requireRun(store, action.runId)
      if (run.status !== 'success') throw new DomainError('완료된 진단을 선택해 주세요.')
      if (store.items.some(item => item.month === action.month && item.format === run.format &&
        requireRun(store, item.runId).question.id === run.question.id)) break
      store.items.push({ id, month: action.month, runId: run.id, title: run.question.text,
        format: run.format, reason: run.evidence || '공식 자료를 보강할 기회를 확인해 보세요.', draft: '', generatedDraft: '' })
      break
    }
    case 'saveDraft':
      requireItem(store, action.itemId).draft = action.markdown
      break
    case 'publish': {
      const item = requireItem(store, action.itemId)
      const url = normalizeUrl(action.url)
      if (item.publication?.url === url) break
      const source = requireRun(store, item.runId)
      const before = newest(store.runs.filter(run => run.status === 'success' && run.at <= now && isComparable(run, source)))
      item.publication = { url, at: now, beforeId: before?.id ?? null }
      break
    }
    case 'apply': {
      const selected = store.verifications.find(entry => entry.id === action.verificationId)
      if (!selected) throw new DomainError('검증 기록을 찾을 수 없습니다.', 404)
      if (selected.appliedAt) return
      const after = requireRun(store, selected.afterId)
      const before = selected.beforeId && requireRun(store, selected.beforeId)
      if (!before || !isComparable(before, after)) throw new DomainError('같은 조건의 기준 회차가 필요합니다.')
      const newer = store.verifications.some(entry => {
        if (!entry.appliedAt) return false
        const other = requireRun(store, entry.afterId)
        return other.question.id === after.question.id && other.question.version === after.question.version &&
          kstMonth(other.at) === kstMonth(after.at) && other.at >= after.at
      })
      if (newer) throw new DomainError('더 최근 검증이 이미 반영됐습니다.', 409)
      selected.appliedAt = now
    }
  }
}

export function monthlyRuns(store: WorkspaceData, month: string) {
  const byVersion = new Map<string, Run>()
  const key = (run: Run) => run.question.id + ':' + run.question.version
  for (const run of store.runs.toSorted((a, b) => a.at.localeCompare(b.at))) {
    if (run.kind === 'diagnosis' && run.status === 'success' && kstMonth(run.at) === month && !byVersion.has(key(run))) {
      byVersion.set(key(run), run)
    }
  }
  const applied = new Set(store.verifications.filter(entry => entry.appliedAt).map(entry => entry.afterId))
  for (const run of store.runs.toSorted((a, b) => a.at.localeCompare(b.at))) {
    if (applied.has(run.id) && kstMonth(run.at) === month) byVersion.set(key(run), run)
  }
  return [...byVersion.values()]
}
export function aggregate(runs: Run[], name: string) {
  const observations = runs.map(run => run.observations.find(value => value.name === name))
  const mentioned = observations.filter(value => value?.mentioned).length
  const domainCount = observations.filter(value => value && value.official !== null).length
  const cited = observations.filter(value => value?.official).length
  const ranks = observations.flatMap(value => value?.rank == null ? [] : [value.rank])
  return {
    observations: runs.length, mentioned, cited, rankCount: ranks.length,
    mentionRate: runs.length ? Math.round(100 * mentioned / runs.length) : null,
    citationRate: domainCount ? Math.round(100 * cited / domainCount) : null,
    averageRank: ranks.length ? ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length : null,
  }
}
export function score(run: Run, name: string) {
  const found = run.observations.find(value => value.name === name)
  return Number(!!found?.mentioned) + Number(found?.rank != null) + Number(!!found?.official)
}
export function newCitations(before: Run, after: Run) {
  const existing = new Set(before.citations.map(value => normalizeUrl(value.url)))
  return after.citations.filter(value => {
    const key = normalizeUrl(value.url)
    if (existing.has(key)) return false
    existing.add(key)
    return true
  })
}
