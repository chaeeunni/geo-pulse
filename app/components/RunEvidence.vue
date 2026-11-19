<script setup lang="ts">
import { ExternalLink } from 'lucide-vue-next'
import { httpUrl, matchesDomain, normalizeUrl, type Run } from "#shared/workspace"
const props = defineProps<{ run: Run; brand: string; domain: string }>()
const demo = computed(() => props.run.model === '샘플 모델')
const citations = computed(() => props.run.citations.filter(entry => httpUrl.safeParse(entry.url).success))
const sourceUrls = computed(() => new Set(citations.value.map(entry => normalizeUrl(entry.url))))
const officialCount = computed(() => [...sourceUrls.value].filter(url => matchesDomain(url, props.domain)).length)
</script>

<template>
  <div class="run-evidence">
    <div class="record-meta">{{ demo ? '공개 샘플' : 'Google Gemini · ' + run.model }} · {{ new Date(run.at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' }) }} · 질문 버전 {{ run.question.version }}</div>
    <div v-if="demo" class="notice">체험용으로 작성한 예시입니다. 실제 AI 호출과 웹 검색은 0회입니다.</div>
    <div v-if="run.status === 'error'" class="notice danger" role="alert">{{ run.error }}</div>
    <template v-else>
      <div class="observation-row" v-if="run.observations.find(item => item.name === brand)">
        <span class="pill">{{ run.observations.find(item => item.name === brand)?.mentioned ? '브랜드 언급' : '브랜드 미언급' }}</span>
        <span class="pill">{{ run.observations.find(item => item.name === brand)?.rank == null ? '순위 미측정' : run.observations.find(item => item.name === brand)?.rank + '위 추천' }}</span>
        <span class="pill">{{ run.observations.find(item => item.name === brand)?.official ? '공식 출처 인용' : '공식 출처 인용 없음' }}</span>
      </div>
      <template v-if="!demo">
        <h4>Gemini에 보낸 질문</h4>
        <p>{{ run.question.text }}</p>
        <h4>Google 검색 기록</h4>
        <ul v-if="run.searchQueries?.length" class="citation-list">
          <li v-for="query in run.searchQueries" :key="query">{{ query }}</li>
        </ul>
        <p v-else class="muted">{{ run.searchQueries ? 'Gemini 응답에 검색어 기록이 없습니다.' : '이 진단에는 저장된 검색 기록이 없습니다.' }}</p>
      </template>
      <h4>{{ demo ? '예시 답변' : 'Gemini 답변 원문' }}</h4>
      <div class="answer-text">{{ run.answer }}</div>
      <h4>{{ demo ? '예시 인용 출처' : 'Gemini가 제공한 인용 출처' }}</h4>
      <p v-if="!demo" class="muted">인용 연결 {{ citations.length }}건 · 고유 출처 {{ sourceUrls.size }}개 · 우리 브랜드 공식 출처 {{ officialCount }}개</p>
      <ul v-if="citations.length" class="citation-list">
        <li v-for="(entry, i) in citations" :key="i">
          <span v-if="demo">{{ entry.title }}</span>
          <template v-else>
            <a :href="entry.url" target="_blank" rel="noopener noreferrer">{{ entry.title }} <ExternalLink :size="13" /></a>
            <p>{{ entry.url }}</p>
          </template>
          <p>연결된 답변 구절 “{{ entry.quote }}”</p>
        </li>
      </ul>
      <p v-else class="muted">{{ demo ? '예시 인용이 없습니다.' : 'Gemini가 연결한 인용 출처가 없습니다.' }}</p>
      <p v-if="!demo" class="muted">인용은 Gemini가 답변에 연결한 근거입니다. 답변의 사실 여부는 출처 원문에서 확인해 주세요.</p>
    </template>
  </div>
</template>
