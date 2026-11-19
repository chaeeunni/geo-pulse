<script setup lang="ts">
import { Menu, X } from 'lucide-vue-next'
const open = ref(false)
const route = useRoute()
watch(() => route.fullPath, () => { open.value = false })
</script>

<template>
  <div class="public-shell">
    <header class="public-header">
      <div class="public-nav container">
        <BrandMark />
        <button class="icon-button mobile-toggle" type="button" :aria-expanded="open" aria-controls="public-links" aria-label="메뉴" @click="open = !open">
          <X v-if="open" :size="22" /><Menu v-else :size="22" />
        </button>
        <nav id="public-links" class="public-links" :class="{ open }" aria-label="서비스">
          <NuxtLink to="/#workflow">기능 소개</NuxtLink>
          <NuxtLink to="/pricing">요금</NuxtLink>
          <NuxtLink to="/app?mode=demo">공개 샘플</NuxtLink>
          <NuxtLink class="button primary" to="/app">워크스페이스</NuxtLink>
        </nav>
      </div>
    </header>
    <main><slot /></main>
    <footer class="public-footer">
      <div class="container footer-row">
        <BrandMark />
        <nav aria-label="하단 메뉴"><NuxtLink to="/pricing">요금</NuxtLink><NuxtLink to="/app?mode=demo">공개 샘플</NuxtLink></nav>
      </div>
    </footer>
  </div>
</template>
