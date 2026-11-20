<script setup lang="ts">
import { BadgeCheck, Check, CircleHelp, Layers3 } from 'lucide-vue-next'
await usePageSeo('/pricing', '요금', '브랜드 1개를 위한 GEO Pulse 월 구독과 무료 공개 샘플의 이용 조건을 확인하세요.')
const { data: product } = await useFetch('/api/billing/product')
const cost = computed(() => product.value?.price ? new Intl.NumberFormat('ko-KR').format(product.value.price) + '원' : '판매 준비 중')
</script>

<template>
  <section class="pricing-page container">
    <div class="section-heading pricing-heading">
      <h1>브랜드 1개, 월 구독</h1>
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
        <h2>GEO Pulse 월 구독</h2><p>내 브랜드의 질문을 실제 AI 검색 결과로 진단하세요.</p>
        <div class="price">{{ cost }} <small v-if="product?.price">/ 월</small></div>
        <ul class="feature-list"><li><Check :size="18" />브랜드 워크스페이스 1개</li><li><Check :size="18" />AI 진단·초안·검증 무제한 실행</li><li><Check :size="18" />월간 자동 갱신 · 그로블에서 해지</li></ul>
        <NuxtLink v-if="product?.available" class="button primary" to="/app?purchase=1">월 구독 시작</NuxtLink>
        <NuxtLink v-else class="button secondary" to="/app">내 워크스페이스</NuxtLink>
      </article>
    </div>
    <div class="pricing-faq">
      <h2><CircleHelp :size="23" /> 이용 안내</h2>
      <details><summary>이용 기간과 자동 갱신은 어떻게 적용되나요?</summary><p>결제가 확인되면 선택한 브랜드에 다음 결제 예정일까지 적용됩니다. 매월 갱신 결제가 확인되면 새 기간이 열리고, 기간이 지나도 기존 기록을 볼 수 있습니다.</p></details>
      <details><summary>자동 갱신은 어디서 해지하나요?</summary><p>그로블 주문조회에서 해지를 요청할 수 있습니다. 해지 요청 후에는 이미 결제된 이용 기간까지 사용할 수 있습니다.</p></details>
      <details><summary>환불은 어떻게 진행하나요?</summary><p>{{ product?.refundTerms || '판매 시작 시 확정된 환불 조건을 이곳에서 확인할 수 있습니다.' }}</p></details>
    </div>
  </section>
</template>
