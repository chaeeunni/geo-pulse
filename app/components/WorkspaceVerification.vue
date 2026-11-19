<script setup lang="ts">
import { CircleCheck, Files, Sparkles } from 'lucide-vue-next'
import { isComparable, newCitations, requireRun, score, type Action, type Workspace } from "#shared/workspace"
const props = defineProps<{ workspace: Workspace; selected?: string; busy: boolean }>()
const emit = defineEmits<{ action: [action: Action]; jump: [view: string] }>()
const publications = computed(() => props.workspace.data.items.filter(item => item.publication))
const selection = computed(() => props.workspace.data.verifications.find(entry => entry.id === props.selected))
const id = ref(selection.value?.itemId ?? props.selected ?? '')
const chosen = ref(selection.value?.id ?? '')
watch(() => props.selected, value => {
  if (value) { id.value = selection.value?.itemId ?? value; chosen.value = selection.value?.id ?? '' }
})
const item = computed(() => publications.value.find(entry => entry.id === id.value) ?? publications.value[0])
const history = computed(() => props.workspace.data.verifications.filter(entry => entry.itemId === item.value?.id).slice().reverse())
const verification = computed(() => history.value.find(entry => entry.id === chosen.value) ?? history.value[0])
const before = computed(() => verification.value?.beforeId ? requireRun(props.workspace.data, verification.value.beforeId) : null)
const after = computed(() => verification.value ? requireRun(props.workspace.data, verification.value.afterId) : null)
const comparable = computed(() => !!before.value && !!after.value && isComparable(before.value, after.value))
const name = computed(() => props.workspace.brand.name)
const difference = computed(() => comparable.value ? score(after.value!, name.value) - score(before.value!, name.value) : null)
const rankDifference = computed(() => {
  if (!comparable.value) return '미산출'
  const a = before.value!.observations.find(entry => entry.name === name.value)?.rank
  const b = after.value!.observations.find(entry => entry.name === name.value)?.rank
  return b == null ? '미측정' : a == null ? '신규 ' + b + '위' : a === b ? '변화 없음' : Math.abs(a - b) + '단계 ' + (a > b ? '상승' : '하락')
})
const sources = computed(() => before.value && after.value ? newCitations(before.value, after.value) : [])
const newId = () => crypto.randomUUID()
</script>

<template>
  <div class="view-stack">
    <section class="panel">
      <div class="panel-heading"><div><h2>검증할 콘텐츠</h2><p>발행 전에 기록한 질문을 같은 조건에서 다시 실행하세요.</p></div></div>
      <div v-if="item" class="publication-form">
        <label>발행 콘텐츠<select :value="item.id" @change="id = ($event.target as HTMLSelectElement).value; chosen = ''"><option v-for="entry in publications" :key="entry.id" :value="entry.id">{{ entry.title }}</option></select></label>
        <button class="button primary" :disabled="busy" @click="emit('action', { type: 'verify', itemId: item.id, requestId: newId() })"><Sparkles :size="17" /> {{ busy ? '처리 중…' : '같은 질문으로 검증' }}</button>
      </div>
      <p v-if="item?.publication" class="muted url-wrap"><a :href="item.publication.url" target="_blank" rel="noopener noreferrer">{{ item.publication.url }}</a> · {{ item.publication.at.slice(0, 10) }} 발행 등록</p>
      <div v-else class="empty-state"><Files :size="25" /><h3>아직 발행된 콘텐츠가 없어요</h3><p>콘텐츠 안건에 발행 URL을 먼저 등록하세요.</p><button class="button secondary" @click="emit('jump', 'content')">콘텐츠 열기</button></div>
    </section>
    <template v-if="verification && after">
      <section class="panel">
        <div class="panel-heading">
          <div><h2>검증 요약</h2><p>발행 전후에 관측된 변화를 비교합니다.</p></div>
          <button class="button primary" :disabled="busy || !comparable || !!verification.appliedAt" @click="emit('action', { type: 'apply', verificationId: verification.id })"><CircleCheck :size="17" /> {{ verification.appliedAt ? '성과 반영 완료' : '대시보드 성과에 반영' }}</button>
        </div>
        <label v-if="history.length > 1">검증 회차<select v-model="chosen"><option v-for="entry in history" :key="entry.id" :value="entry.id">{{ new Date(requireRun(workspace.data, entry.afterId).at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) }}</option></select></label>
        <div v-if="!comparable" class="notice">비교할 수 있는 동일 조건의 회차가 없어 참고 결과로 표시합니다.</div>
        <div class="verification-summary"><div><small>점수 변화</small><strong>{{ difference == null ? '미산출' : (difference > 0 ? '+' : '') + difference }}</strong></div><div><small>추천 순위 변화</small><strong>{{ rankDifference }}</strong></div><div><small>신규 인용</small><strong>{{ comparable ? sources.length + '건' : '미산출' }}</strong></div></div>
        <ul v-if="comparable && sources.length" class="citation-list"><li v-for="source in sources" :key="source.url"><span v-if="after.model === '샘플 모델'">예시 · {{ source.title }}</span><a v-else :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }}</a><p>{{ source.quote }}</p></li></ul>
      </section>
      <div class="compare-grid">
        <section class="panel"><h3>발행 전 <span v-if="before" class="pill">{{ score(before, name) }} / 3점</span></h3><RunEvidence v-if="before" :run="before" :brand="name" :domain="workspace.brand.domain" /><p v-else class="muted">기준 회차가 없습니다.</p></section>
        <section class="panel"><h3>발행 후 <span class="pill">{{ score(after, name) }} / 3점</span></h3><RunEvidence :run="after" :brand="name" :domain="workspace.brand.domain" /></section>
      </div>
    </template>
  </div>
</template>
