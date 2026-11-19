<script setup lang="ts">
import { BadgeCheck, Check, CircleHelp, Layers3 } from 'lucide-vue-next'
await usePageSeo('/pricing', '요금', '브랜드 1개를 위한 GEO Pulse 30일 패스와 무료 공개 샘플의 이용 조건을 확인하세요.')
const { data: product } = await useFetch('/api/billing/product')
const cost = computed(() => product.value?.price ? new Intl.NumberFormat('ko-KR').format(product.value.price) + '원' : '판매 준비 중')
</script>

<template>
  <section class="pricing-page container">
    <div class="section-heading pricing-heading">
      <h1>브랜드 1개, 30일 패스</h1>
      <p>AI 답변을 진단하고 콘텐츠를 발행한 뒤, 같은 질문으로 변화를 확인하세요.</p>
    </div>
    <div class="price-grid">
      <article class="price-card">
        <span class="feature-icon"><Layers3 :size="23" /></span>
        <h2>공개 샘플</h2><p>가상 브랜드로 워크스페이스의 전체 흐름을 둘러보세요.</p>
        <div class="price">무료</div>
        <ul class="feature-list"><li><Check :size="18" />샘플 브랜드 2개</li><li><Check :size="18" />진단·콘텐츠·검증 예시</li><li><Check :size="18" />로그인 없이 체험</li></ul>
        <NuxtLink class="button secondary" to="/app?mode=demo">공개 샘플 열기</NuxtLink>
      </article>
      <article class="price-card featured">
        <span class="feature-icon"><BadgeCheck :size="23" /></span>
        <h2>30일 이용권</h2><p>내 브랜드의 질문을 실제 AI 검색 결과로 진단하세요.</p>
        <div class="price">{{ cost }} <small v-if="product?.price">/ 30일</small></div>
        <ul class="feature-list"><li><Check :size="18" />브랜드 워크스페이스 1개</li><li><Check :size="18" />{{ product?.credits ? 'AI 실행 ' + product.credits + '회 · 진단, 초안, 검증에 사용' : 'AI 진단, 초안 생성, 발행 후 검증' }}</li><li><Check :size="18" />단건 결제 · 자동 갱신 없음</li></ul>
        <NuxtLink v-if="product?.available" class="button primary" to="/app?purchase=1">30일 이용권 구매</NuxtLink>
        <NuxtLink v-else class="button secondary" to="/app">내 워크스페이스</NuxtLink>
      </article>
    </div>
    <div class="pricing-faq">
      <h2><CircleHelp :size="23" /> 이용 안내</h2>
      <details><summary>이용기간은 언제부터 시작하나요?</summary><p>결제 확인 시점부터 구매한 워크스페이스에 30일 동안 적용됩니다. 기간이 지나도 기존 기록을 볼 수 있습니다.</p></details>
      <details><summary>환불은 어떻게 진행하나요?</summary><p>{{ product?.refundTerms || '판매 시작 시 확정된 환불 조건을 이곳에서 확인할 수 있습니다.' }}</p></details>
    </div>
  </section>
</template>
