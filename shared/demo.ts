import {
  aiInput, applyAi, emptyData, formats, kstMonth, monthsEndingAt, stages,
  type AiAction, type AiInput, type AiResult, type Brand, type Question, type Run, type Workspace,
} from './workspace'

const samples: { brand: Brand; questions: string[] }[] = [
  {
    brand: { name: '라움 오디오', category: '휴대용 오디오', domain: 'raum.example', aliases: ['라움'],
      competitors: [{ name: '톤웨이브', domain: 'tonewave.example', aliases: [] }, { name: '웨이브박스', domain: 'wavebox.example', aliases: [] }] },
    questions: ['야외에서 오래 쓸 휴대용 스피커는?', '캠핑용 블루투스 스피커 추천해 줘', '방수 스피커의 IP 등급은 어떻게 비교해?', '작은 공간에 어울리는 무선 스피커는?', '20만 원대 휴대용 스피커를 고른다면?'],
  },
  {
    brand: { name: '클라우드노트', category: '팀 문서 협업', domain: 'cloudnote.example', aliases: [],
      competitors: [{ name: '팀페이지', domain: 'teampage.example', aliases: [] }] },
    questions: ['작은 팀이 쓰기 좋은 문서 협업 도구는?', '게스트 권한을 관리할 수 있는 문서 도구는?', '프로젝트 위키를 쉽게 구축하는 방법은?'],
  },
]

function fixtureId(index: number) {
  return '00000000-0000-4000-8000-' + String(index).padStart(12, '0')
}

function demoRun(brand: Brand, question: Question, id: string, at: string, kind: Run['kind'], index: number): Run {
  const verified = kind === 'verification'
  const mentioned = verified || index < 3
  const rank = verified ? 1 : index === 1 ? 1 : index === 2 ? 3 : null
  const official = verified || index === 1 || index === 2
  const competitor = brand.competitors[0]!
  const quote = brand.category === '휴대용 오디오' ? '배터리 시험 조건과 실제 사용 시간을 확인하세요.' : '공유 권한과 변경 이력 관리 기능을 확인하세요.'
  const brandText = mentioned ? (rank === null ? brand.name + '도 확인해 볼 수 있습니다.' : rank + '위. ' + brand.name + '을 추천합니다.') : '이 예시 답변에서는 자사 제품을 확인하지 못했습니다.'
  return {
    id, question: { ...question }, at, model: '샘플 모델', language: 'ko', search: true, promptVersion: 1, kind,
    status: 'success', answer: brandText + '\n\n' + competitor.name + '도 비교 후보입니다. ' + quote,
    citations: [{ title: competitor.name + ' 자료', url: 'https://' + competitor.domain + '/guide', quote },
      ...(official ? [{ title: brand.name + (verified ? ' 실사용 리포트' : ' 제품 가이드'), url: 'https://' + brand.domain + (verified ? '/report' : '/guide'), quote }] : [])],
    observations: [
      { name: brand.name, mentioned, rank, official },
      ...brand.competitors.map((entry, i) => ({ name: entry.name, mentioned: i === 0, rank: i === 0 && rank !== 1 ? 1 : null, official: i === 0 })),
    ],
    format: formats[index === 0 ? 2 : index % formats.length]!,
    evidence: quote + ' 확인 가능한 공식 자료를 보강하는 안건입니다.',
  }
}

export function createDemo(month = kstMonth()): Workspace[] {
  return samples.map(({ brand, questions }, i) => {
    const workspace = { id: fixtureId(i + 1), brand, data: emptyData() }
    const data = workspace.data
    data.questions = questions.map((text, index) => ({
      id: fixtureId(100 + i * 10 + index), text, stage: stages[index % stages.length]!, version: 1, priority: index === 0 ? 3 : 2,
    }))
    monthsEndingAt(month).forEach((key, offset) => {
      const count = offset === 5 ? data.questions.length : Math.max(1, data.questions.length - (offset % 3))
      data.questions.slice(0, count).forEach((question, index) => {
        const run = demoRun(brand, question, fixtureId(1000 + i * 100 + offset * 10 + index), key + '-01T00:00:00.000Z', 'diagnosis', index)
        if (offset < 5 && index === offset % count) {
          run.observations[0] = { name: brand.name, mentioned: offset > 2, rank: null, official: false }
        }
        data.runs.push(run)
      })
    })
    const first = data.runs.find(run => kstMonth(run.at) === month)!
    data.items.push({ id: fixtureId(2000 + i), month, runId: first.id, title: first.question.text, format: first.format,
      reason: first.evidence, generatedDraft: '', draft: '' })
    return workspace
  })
}

export function demoAi(workspace: Workspace, action: AiAction, input: AiInput, now: string): AiResult {
  if (action.type === 'generate') {
    return { markdown: '# ' + input.item?.format + '\n\n## TL;DR\n' + input.question.text +
      '\n\n## 비교표\n| 비교 기준 | 확인 결과 |\n| --- | --- |\n| 공식 자료 | [확인 필요] |\n\n## FAQ\n**' +
      input.question.text + '**\n\n[확인 필요]' }
  }
  const index = Math.max(0, workspace.data.questions.findIndex(question => question.id === input.question.id))
  return { run: demoRun(workspace.brand, input.question, action.requestId, now, action.type === 'verify' ? 'verification' : 'diagnosis', index) }
}

export function runDemo(workspace: Workspace, action: AiAction, now: string) {
  const input = aiInput(workspace.data, action)
  applyAi(workspace.data, action, input, demoAi(workspace, action, input, now))
}
