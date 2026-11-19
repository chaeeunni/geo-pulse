<script setup lang="ts">
import { Fingerprint, MessageCircle } from 'lucide-vue-next'
useSeoMeta({ title: '로그인', robots: 'noindex, nofollow' })
const route = useRoute()
const { data } = await useFetch('/api/auth/session')
const busy = ref('')
const error = ref(route.query.error === 'oauth' ? '로그인이 취소됐거나 완료되지 않았습니다. 다시 시도해 주세요.' : '')
async function signIn(provider: 'kakao' | 'google') {
  busy.value = provider
  error.value = ''
  try {
    const response = await $fetch('/api/auth/start', { method: 'POST', body: { provider, next: route.query.next } })
    window.location.assign(response.url)
  } catch {
    error.value = '로그인을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.'
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <section class="center-page container"><div class="center-card">
    <span class="feature-icon"><Fingerprint :size="26" /></span>
    <h1>GEO Pulse 로그인</h1>
    <p>내 브랜드의 질문, 콘텐츠, 검증 결과를 저장하세요.</p>
    <div v-if="!data?.configured" class="notice">이 환경에서 계정 로그인을 사용하려면 운영자가 OAuth를 연결해야 합니다. 공개 샘플은 바로 이용할 수 있습니다.</div>
    <div v-if="error" class="notice danger" role="alert">{{ error }}</div>
    <div class="auth-buttons">
      <button class="button kakao" :disabled="!data?.configured || !!busy" @click="signIn('kakao')"><MessageCircle :size="18" />카카오로 계속하기</button>
      <button class="button secondary" :disabled="!data?.configured || !!busy" @click="signIn('google')"><span class="google-g">G</span>Google로 계속하기</button>
    </div>
    <NuxtLink class="text-button" to="/app?mode=demo">공개 샘플 둘러보기</NuxtLink>
  </div></section>
</template>
