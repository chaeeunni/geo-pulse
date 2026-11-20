<script setup lang="ts">
import { CreditCard } from 'lucide-vue-next'
definePageMeta({ middleware: 'require-account' })
useSeoMeta({ title: '결제 확인', robots: 'noindex, nofollow' })
const { data, refresh, error, pending } = await useFetch('/api/billing/status')
const state = computed(() => error.value ? 'review' : data.value?.status)
const labels = {
  paid: ['이용권을 사용할 수 있어요', '결제가 확인됐습니다. 워크스페이스를 열어 진단을 시작하세요.'],
  pending: ['결제 확인 중', '결제 결과가 아직 도착하지 않았습니다. 잠시 후 상태를 다시 확인해 주세요.'],
  review: ['결제 확인이 필요해요', '주문 정보를 자동으로 확인할 수 없습니다. 구매 내역을 확인해 주세요.'],
  refunded: ['환불이 확인됐어요', '이 거래의 이용권이 회수됐습니다.'],
  expired: ['이용 기간이 종료됐어요', '결제 기록은 확인됐습니다. 워크스페이스에서 현재 구독 상태를 확인해 주세요.'],
  missing: ['확인할 주문이 없어요', '구매를 진행한 계정으로 로그인했는지 확인해 주세요.'],
}
const message = computed(() => labels[state.value as keyof typeof labels] ?? labels.pending)
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  let tries = 0
  timer = setInterval(() => {
    if (state.value === 'pending' && tries++ < 12) void refresh()
    else clearInterval(timer)
  }, 2500)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <section class="center-page container"><div class="center-card">
    <span class="feature-icon"><CreditCard :size="25" /></span>
    <h1>{{ message[0] }}</h1><p>{{ message[1] }}</p>
    <div class="button-group">
      <NuxtLink class="button primary" :to="{ path: '/app', query: { workspace: data?.workspaceId ?? undefined } }">워크스페이스 열기</NuxtLink>
      <button v-if="state === 'pending' || state === 'review'" class="button secondary" :disabled="pending" @click="refresh()">상태 다시 확인</button>
    </div>
  </div></section>
</template>
