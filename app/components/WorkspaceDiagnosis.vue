<script setup lang="ts">
import { ChevronRight, CircleHelp, Pencil, Plus, Sparkles } from 'lucide-vue-next'
import { newest, stages, type Action, type Question, type Workspace } from "#shared/workspace"
const props = defineProps<{ workspace: Workspace; month: string; selected?: string; stage?: string; busy: boolean }>()
const emit = defineEmits<{ action: [action: Action]; batch: [ids: string[]]; content: [] }>()
const filter = ref(props.stage ?? '')
const search = ref('')
const active = ref(props.selected ?? '')
const edit = ref<Question | null>(null)
const formOpen = ref(false)
const text = ref('')
const stage = ref<Question['stage']>('탐색')
const priority = ref(2)
const checked = ref<string[]>([])
watch(() => props.selected, value => { active.value = value ?? '' })
watch(() => props.stage, value => { filter.value = value ?? '' })
const questions = computed(() => props.workspace.data.questions.filter(question =>
  (!filter.value || question.stage === filter.value) && question.text.toLowerCase().includes(search.value.toLowerCase())))
const selection = computed(() => questions.value.filter(question => checked.value.includes(question.id)).map(question => question.id))
const run = computed(() => props.workspace.data.runs.find(run => run.id === active.value))
const last = (question: Question) => newest(props.workspace.data.runs.filter(run =>
  run.question.id === question.id && run.question.version === question.version && run.kind === 'diagnosis'))
const existing = computed(() => run.value && props.workspace.data.items.find(item => item.runId === run.value!.id && item.month === props.month))
function editQuestion(question?: Question) {
  edit.value = question ?? null
  text.value = question?.text ?? ''
  stage.value = question?.stage ?? '탐색'
  priority.value = question?.priority ?? 2
  formOpen.value = true
}
function save() {
  emit('action', { type: 'saveQuestion', id: edit.value?.id, text: text.value, stage: stage.value, priority: priority.value })
  formOpen.value = false
}
function checkAll(event: Event) {
  checked.value = (event.target as HTMLInputElement).checked ? questions.value.map(question => question.id) : []
}
</script>

<template>
  <div class="view-stack">
    <section class="panel">
      <div class="panel-heading">
        <div><h2>등록된 질문</h2><p v-if="questions.length">표시된 질문 {{ questions.length }}개 · 선택 {{ selection.length }}개</p></div>
        <div class="button-group">
          <button class="button secondary" :disabled="busy" @click="editQuestion()"><Plus :size="16" /> 질문 추가</button>
          <button class="button primary" :disabled="busy || !selection.length" @click="emit('batch', selection)"><Sparkles :size="17" /> {{ busy ? '처리 중…' : '실시간 AI 진단' }}</button>
        </div>
      </div>
      <form v-if="formOpen" class="inline-form" @submit.prevent="save">
        <label>고객 질문<input v-model="text" required minlength="3" maxlength="1000" placeholder="예: 야외에서 오래 쓸 휴대용 스피커는?" /></label>
        <div class="form-columns">
          <label>퍼널 단계<select v-model="stage"><option v-for="value in stages" :key="value">{{ value }}</option></select></label>
          <label>중요도<select v-model.number="priority"><option :value="1">낮음</option><option :value="2">보통</option><option :value="3">높음</option></select></label>
        </div>
        <div class="button-group"><button class="button primary" :disabled="busy">저장</button><button type="button" class="button secondary" @click="formOpen = false">취소</button></div>
      </form>
      <div v-if="workspace.data.questions.length" class="filters">
        <input v-model="search" aria-label="질문 검색" type="search" placeholder="질문 검색" />
        <select v-model="filter" aria-label="퍼널 단계"><option value="">전체 퍼널</option><option v-for="value in stages" :key="value">{{ value }}</option></select>
      </div>
      <div v-if="questions.length" class="table-scroll">
        <table>
          <thead><tr><th><input type="checkbox" aria-label="표시된 질문 모두 선택" :checked="selection.length === questions.length" @change="checkAll" /></th><th>고객 질문</th><th>퍼널</th><th>최근 진단</th><th>작업</th></tr></thead>
          <tbody>
            <tr v-for="question in questions" :key="question.id">
              <td><input v-model="checked" type="checkbox" :value="question.id" :aria-label="question.text + ' 선택'" /></td>
              <td><button v-if="last(question)" class="table-question" @click="active = last(question)!.id">{{ question.text }}<ChevronRight :size="15" /></button><span v-else>{{ question.text }}</span></td>
              <td><span class="pill">{{ question.stage }}</span></td>
              <td>{{ last(question)?.status === 'success' ? (last(question)?.citations.length ? '완료' : '인용 미확인') : last(question)?.status === 'error' ? '오류' : '미실행' }}</td>
              <td><div class="row-actions"><button class="icon-button" :aria-label="question.text + ' 수정'" :disabled="busy" @click="editQuestion(question)"><Pencil :size="15" /></button><button class="text-button" :disabled="busy" @click="emit('batch', [question.id])">{{ last(question) ? '재진단' : '진단' }}</button></div></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty-state"><CircleHelp :size="25" /><h3>{{ workspace.data.questions.length ? '일치하는 질문이 없어요' : '첫 질문을 추가해 보세요' }}</h3><p>{{ workspace.data.questions.length ? '검색어나 퍼널 필터를 바꿔 보세요.' : '고객이 AI에 물어볼 만한 질문부터 시작하세요.' }}</p></div>
    </section>
    <section v-if="run" class="panel" tabindex="-1">
      <div class="panel-heading"><div><h2>{{ run.question.text }}</h2><p>진단 상세</p></div>
        <button v-if="run.status === 'success'" class="button secondary" :disabled="busy" @click="existing ? emit('content') : emit('action', { type: 'addItem', runId: run.id, month })">{{ existing ? '등록된 안건 보기' : '이번 달 안건으로 등록' }}</button>
      </div>
      <RunEvidence :run="run" :brand="workspace.brand.name" />
      <div v-if="run.status === 'success'" class="notice"><strong>{{ run.format }}</strong><p>{{ run.evidence }}</p><p v-if="run.observations.slice(1).some(entry => entry.mentioned)">언급된 경쟁사 · {{ run.observations.slice(1).filter(entry => entry.mentioned).map(entry => entry.name).join(', ') }}</p></div>
    </section>
  </div>
</template>
