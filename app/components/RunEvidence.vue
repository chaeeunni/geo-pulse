<script setup lang="ts">
import { ExternalLink } from 'lucide-vue-next'
import type { Run } from "#shared/workspace"
defineProps<{ run: Run; brand: string }>()
</script>

<template>
  <div class="run-evidence">
    <div class="record-meta">{{ run.model }} · {{ new Date(run.at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' }) }} · 질문 버전 {{ run.question.version }}</div>
    <div v-if="run.status === 'error'" class="notice danger" role="alert">{{ run.error }}</div>
    <template v-else>
      <div class="observation-row" v-if="run.observations.find(item => item.name === brand)">
        <span class="pill">{{ run.observations.find(item => item.name === brand)?.mentioned ? '브랜드 언급' : '브랜드 미언급' }}</span>
        <span class="pill">{{ run.observations.find(item => item.name === brand)?.rank == null ? '순위 미측정' : run.observations.find(item => item.name === brand)?.rank + '위 추천' }}</span>
        <span class="pill">{{ run.observations.find(item => item.name === brand)?.official ? '공식 출처 인용' : '공식 출처 인용 없음' }}</span>
      </div>
      <h4>AI 답변 원문</h4>
      <div class="answer-text">{{ run.answer }}</div>
      <h4>인용 출처</h4>
      <ul v-if="run.citations.length" class="citation-list">
        <li v-for="(entry, i) in run.citations" :key="i">
          <a :href="entry.url" target="_blank" rel="noopener noreferrer">{{ entry.title }} <ExternalLink :size="13" /></a>
          <p>{{ entry.quote }}</p>
        </li>
      </ul>
      <p v-else class="muted">확인된 인용이 없습니다.</p>
    </template>
  </div>
</template>
