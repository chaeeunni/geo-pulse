<script setup lang="ts">
import { Check, Clipboard, FileText, Sparkles } from 'lucide-vue-next'
import { checklist, kstMonth, type Action, type Workspace } from "#shared/workspace"
const props = defineProps<{ workspace: Workspace; month: string; selected?: string; busy: boolean }>()
const emit = defineEmits<{ action: [action: Action]; jump: [view: string, id?: string] }>()
const active = ref(props.selected ?? '')
const markdown = ref('')
const link = ref('')
const message = ref('')
const items = computed(() => props.workspace.data.items.filter(item =>
  item.month === props.month || (item.id === props.selected && item.publication && kstMonth(item.publication.at) === props.month)))
const item = computed(() => items.value.find(row => row.id === active.value) ?? items.value[0])
watch(() => props.selected, value => { if (value) active.value = value })
watch(() => item.value?.id, () => {
  markdown.value = item.value?.draft ?? ''
  link.value = item.value?.publication?.url ?? ''
  message.value = ''
}, { immediate: true })
watch(() => item.value?.draft, (value, old) => {
  if (markdown.value === old) markdown.value = value ?? ''
})
async function copy() {
  try { await navigator.clipboard.writeText(markdown.value); message.value = 'Markdown을 복사했습니다.' }
  catch { message.value = '복사할 수 없습니다. 편집기에서 텍스트를 선택해 복사해 주세요.' }
}
const newId = () => crypto.randomUUID()
</script>

<template>
  <div class="view-stack">
    <section class="panel">
      <div class="panel-heading"><div><h2>월간 콘텐츠 안건</h2><p>진단 근거를 바탕으로 콘텐츠를 준비하세요.</p></div><button class="button secondary" @click="emit('jump', 'diagnosis')">진단으로 이동</button></div>
      <div v-if="items.length" class="item-row">
        <button v-for="row in items" :key="row.id" class="item-tile" :class="{ selected: item?.id === row.id }" @click="active = row.id">
          <span class="metric-icon"><FileText :size="17" /></span><span><strong>{{ row.title }}</strong><small>{{ row.format }} · {{ row.publication ? '배포 완료' : row.draft || row.generatedDraft ? '제작 중' : '등록' }}</small></span>
        </button>
      </div>
      <div v-else class="empty-state"><FileText :size="26" /><h3>이번 달에 등록된 안건이 없어요</h3><p>진단 상세에서 다루고 싶은 질문을 안건으로 등록하세요.</p></div>
    </section>
    <template v-if="item">
      <div class="editor-grid">
        <section class="panel">
          <div class="panel-heading"><div><h2>근거와 준비 자료</h2><p>{{ item.format }}</p></div></div>
          <p>{{ item.reason }}</p>
          <ul class="feature-list"><li v-for="entry in checklist[item.format]" :key="entry"><Check :size="16" />{{ entry }}</li></ul>
          <button class="text-button" @click="emit('jump', 'diagnosis', item.runId)">연결된 진단 보기</button>
        </section>
        <section class="panel">
          <div class="panel-heading"><div><h2>초안 스튜디오</h2><p>필요한 자료를 채우고 Markdown을 편집하세요.</p></div>
            <button class="button secondary" :disabled="busy" @click="emit('action', { type: 'generate', itemId: item.id, requestId: newId() })"><Sparkles :size="16" /> {{ item.generatedDraft ? '초안 재생성' : 'AI 초안 생성' }}</button>
          </div>
          <details v-if="item.generatedDraft" class="generated-block"><summary>생성된 초안 보기</summary><pre>{{ item.generatedDraft }}</pre><button class="button secondary" :disabled="!!markdown" @click="markdown = item.generatedDraft">{{ markdown ? '편집본이 있어 초안 삽입 제한' : '편집기에 넣기' }}</button></details>
          <label>Markdown 편집기<textarea v-model="markdown" rows="8" maxlength="20000" placeholder="TL;DR, 비교표, FAQ를 작성하세요." /></label>
          <div class="button-group editor-actions"><button class="button primary" :disabled="busy" @click="emit('action', { type: 'saveDraft', itemId: item.id, markdown })">편집본 저장</button><button class="button secondary" :disabled="!markdown" @click="copy"><Clipboard :size="16" /> 복사</button></div>
          <p v-if="message" class="muted" role="status">{{ message }}</p>
        </section>
      </div>
      <section class="panel">
        <div class="panel-heading"><div><h2>발행 기록</h2><p>외부에 발행한 콘텐츠의 URL을 등록하세요.</p></div><button v-if="item.publication" class="button secondary" @click="emit('jump', 'verification', item.id)">이 콘텐츠 검증하기</button></div>
        <form class="publication-form" @submit.prevent="emit('action', { type: 'publish', itemId: item.id, url: link })">
          <label>발행 URL<input v-model="link" type="url" required maxlength="2048" placeholder="https://example.com/report" /></label><button class="button primary" :disabled="busy">발행 URL 저장</button>
        </form>
        <p v-if="item.publication" class="muted">저장됨 · <a :href="item.publication.url" target="_blank" rel="noopener noreferrer">{{ item.publication.url }}</a></p>
      </section>
    </template>
  </div>
</template>
