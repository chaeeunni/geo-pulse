<script setup lang="ts">
if (!import.meta.dev) throw createError({ statusCode: 404, fatal: true })
useSeoMeta({ title: '로컬 OpenRouter 질문 진단', robots: 'noindex, nofollow' })

const question = ref('')
const brand = ref('')
const domain = ref('')
const result = ref<{ answer: string; model: string; citations: { url: string; title: string; quote: string }[]; mentioned: boolean; official: number }>()
const busy = ref(false)
const error = ref('')
async function diagnose() {
  if (busy.value) return
  result.value = undefined
  error.value = ''
  busy.value = true
  try {
    const response = await fetch('/api/local/openrouter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question.value, brand: brand.value, domain: domain.value }),
    })
    const body = await response.json()
    if (!response.ok) {
      error.value = body.data?.message ?? '질문, 브랜드 이름, 공식 도메인을 확인해 주세요.'
    } else result.value = body
  } catch {
    error.value = '로컬 서버에 연결할 수 없습니다.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="container view-stack" style="padding-block: 2rem">
    <div class="workspace-heading"><div><h1>로컬 OpenRouter 질문 진단</h1>
      <p>입력한 질문을 Gemini로 보내고 웹 검색 도구를 사용합니다. 모델 호출과 검색에 OpenRouter 크레딧이 사용될 수 있습니다.</p>
    </div></div>
    <form class="panel view-stack" @submit.prevent="diagnose">
      <fieldset class="view-stack" :disabled="busy">
        <legend>진단 정보</legend>
        <div class="form-columns">
          <label>브랜드명<input v-model.trim="brand" required maxlength="120" placeholder="리딩앤" /></label>
          <label>공식 도메인<input v-model.trim="domain" required placeholder="readingn.com" /></label>
        </div>
        <label>고객 질문<textarea v-model.trim="question" required minlength="3" maxlength="1000" rows="3" /></label>
      </fieldset>
      <div><button class="button primary" :disabled="busy">{{ busy ? '검색하고 답변을 기다리는 중…' : '실제 질문 진단' }}</button></div>
    </form>
    <p v-if="error" class="notice danger" role="alert">{{ error }}</p>
    <section v-if="result" class="panel run-evidence" aria-live="polite">
      <h2>실제 분석 결과</h2>
      <p>OpenRouter · {{ result.model }}</p>
      <p>{{ result.mentioned ? '브랜드 언급 있음' : '브랜드 언급 없음' }} · 공식 출처 {{ result.official }}개</p>
      <h4>Gemini 답변 원문</h4>
      <div class="answer-text">{{ result.answer }}</div>
      <h4>OpenRouter가 반환한 인용 {{ result.citations.length }}건</h4>
      <ul v-if="result.citations.length" class="citation-list">
        <li v-for="(citation, index) in result.citations" :key="index">
          <a :href="citation.url" target="_blank" rel="noopener noreferrer">{{ citation.title }}</a>
          <p>{{ citation.url }}</p><p v-if="citation.quote">연결된 답변 구절 “{{ citation.quote }}”</p>
        </li>
      </ul>
      <p v-else>응답에 확인 가능한 인용이 없었습니다.</p>
    </section>
  </section>
</template>
