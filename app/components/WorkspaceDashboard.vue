<script setup lang="ts">
import { Activity, Archive, ChevronRight, CircleCheck, Crosshair, FileText, Signal, Sparkles, Target } from 'lucide-vue-next'
import { aggregate, kstMonth, monthlyRuns, monthsEndingAt, requireRun, stages, type Workspace } from "#shared/workspace"
const props = defineProps<{ workspace: Workspace; month: string }>()
const emit = defineEmits<{ jump: [view: string, id?: string, stage?: string]; month: [value: string] }>()
const metric = ref<'mentionRate' | 'citationRate' | 'averageRank'>('mentionRate')
const compare = ref('')
watch(() => props.workspace.id, () => { compare.value = '' })
const brand = computed(() => props.workspace.brand.name)
const runs = computed(() => monthlyRuns(props.workspace.data, props.month))
const stats = computed(() => aggregate(runs.value, brand.value))
const items = computed(() => props.workspace.data.items.filter(item => item.month === props.month))
const publications = computed(() => props.workspace.data.items.filter(item => item.publication))
const values = computed(() => [
  { title: '브랜드 언급률', display: stats.value.mentionRate == null ? '—' : stats.value.mentionRate + '%', detail: stats.value.mentioned + ' / ' + stats.value.observations + '개 유효 답변', icon: Signal, view: 'diagnosis' },
  { title: '평균 추천 순위', display: stats.value.averageRank == null ? '—' : stats.value.averageRank.toFixed(1) + '위', detail: '명시 순위 ' + stats.value.rankCount + '건', icon: Target, view: 'diagnosis' },
  { title: '공식 출처 인용률', display: stats.value.citationRate == null ? '—' : stats.value.citationRate + '%', detail: stats.value.cited + ' / ' + stats.value.observations + '개 유효 답변', icon: Crosshair, view: 'diagnosis' },
  { title: '콘텐츠 실행', display: items.value.filter(item => item.publication).length + ' / ' + items.value.length, detail: '배포 완료 / 전체 안건', icon: Archive, view: 'content' },
])
const months = computed(() => monthsEndingAt(props.month))
const trend = computed(() => months.value.map(month => {
  const data = aggregate(monthlyRuns(props.workspace.data, month), brand.value)
  return { month, value: data[metric.value], count: data.observations,
    milestone: publications.value.find(item => kstMonth(item.publication!.at) === month)?.id }
}))
const comparison = computed(() => compare.value ? months.value.map(month => {
  const data = aggregate(monthlyRuns(props.workspace.data, month), compare.value)
  return { value: data[metric.value], count: data.observations }
}) : undefined)
const recent = computed(() => props.workspace.data.verifications.filter(entry =>
  kstMonth(requireRun(props.workspace.data, entry.afterId).at) === props.month).slice(-3).reverse())
const priorities = computed(() => runs.value.filter(run => !items.value.some(item =>
  requireRun(props.workspace.data, item.runId).question.id === run.question.id)).sort((a, b) => {
  const weight = (run: typeof a) => {
    const own = run.observations[0]
    return run.question.priority * 4 + Number(!own?.mentioned && run.observations.slice(1).some(entry => entry.rank !== null)) * 2 + Number(!own?.official)
  }
  return weight(b) - weight(a) || a.question.id.localeCompare(b.question.id)
}).slice(0, 3))
</script>

<template>
  <div class="view-stack">
    <div class="metrics-grid">
      <button v-for="value in values" :key="value.title" class="metric-card" @click="emit('jump', value.view)">
        <span class="metric-top"><span class="metric-icon"><component :is="value.icon" :size="17" /></span><ChevronRight :size="16" class="metric-chevron" /></span>
        <span class="metric-title">{{ value.title }}</span><strong>{{ value.display }}</strong><small>{{ value.detail }}</small>
      </button>
    </div>

    <div class="dashboard-middle">
      <section class="panel trend-panel">
        <div class="panel-heading"><div><h2>AI 노출 추이</h2><p>선택한 월까지 최근 6개월의 결과</p></div>
          <select v-model="compare" class="small-field" aria-label="비교할 경쟁사"><option value="">경쟁사 비교</option><option v-for="entry in workspace.brand.competitors" :key="entry.name">{{ entry.name }}</option></select>
        </div>
        <div class="segmented" aria-label="추이 지표">
          <button :class="{ selected: metric === 'mentionRate' }" @click="metric = 'mentionRate'">언급률</button>
          <button :class="{ selected: metric === 'citationRate' }" @click="metric = 'citationRate'">인용률</button>
          <button :class="{ selected: metric === 'averageRank' }" @click="metric = 'averageRank'">추천 순위</button>
        </div>
        <TrendChart :points="trend" :comparison="comparison" :comparison-label="compare" :rank="metric === 'averageRank'"
          @select="emit('month', $event)" @publication="month => emit('jump', 'content', trend.find(point => point.month === month)?.milestone)" />
        <p v-if="trend.every(point => point.value === null)" class="muted chart-empty">이 기간의 데이터가 없습니다.</p>
      </section>
      <section class="panel">
        <div class="panel-heading"><div><h2>퍼널별 브랜드 언급</h2><p>고객이 질문하는 단계별로 확인하세요</p></div><span class="metric-icon"><Activity :size="16" /></span></div>
        <div class="funnel-list">
          <button v-for="stage in stages" :key="stage" class="funnel-row" @click="emit('jump', 'diagnosis', undefined, stage)">
            <span><strong>{{ stage }}</strong><small>{{ runs.filter(run => run.question.stage === stage).length }}개 유효 질문</small></span>
            <span class="funnel-bar"><i :style="{ width: (aggregate(runs.filter(run => run.question.stage === stage), brand).mentionRate ?? 0) + '%' }" /></span>
            <span>{{ aggregate(runs.filter(run => run.question.stage === stage), brand).mentionRate ?? '—' }}<template v-if="runs.some(run => run.question.stage === stage)">%</template></span>
          </button>
        </div>
      </section>
    </div>
    <div class="dashboard-bottom">
      <section class="panel">
        <div class="panel-heading"><div><h2>우선 살펴볼 질문</h2><p>공식 자료를 보강할 수 있는 기회</p></div><span class="metric-icon"><Sparkles :size="17" /></span></div>
        <div v-if="priorities.length" class="compact-list">
          <button v-for="run in priorities" :key="run.id" @click="emit('jump', 'diagnosis', run.id)"><FileText :size="17" /><span><strong>{{ run.question.text }}</strong><small>{{ run.format }}</small></span><ChevronRight :size="16" /></button>
        </div>
        <p v-else class="empty-copy">진단을 실행하면 우선 살펴볼 질문이 여기에 표시됩니다.</p>
      </section>
      <section class="panel">
        <div class="panel-heading"><div><h2>최근 검증</h2><p>발행 후 확인한 답변 변화</p></div><span class="metric-icon"><CircleCheck :size="17" /></span></div>
        <div v-if="recent.length" class="compact-list">
          <button v-for="entry in recent" :key="entry.id" @click="emit('jump', 'verification', entry.id)"><CircleCheck :size="17" /><span><strong>{{ requireRun(workspace.data, entry.afterId).question.text }}</strong><small>{{ entry.appliedAt ? '성과 반영 완료' : '검토 대기' }}</small></span><ChevronRight :size="16" /></button>
        </div>
        <p v-else class="empty-copy">콘텐츠 발행 후 검증을 실행하면 결과가 여기에 표시됩니다.</p>
      </section>
    </div>
  </div>
</template>
