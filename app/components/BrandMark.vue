<script setup lang="ts">
import { Activity } from 'lucide-vue-next'
</script>

<template>
  <NuxtLink to="/" class="brand-mark" aria-label="GEO Pulse 홈">
    <span class="brand-icon"><Activity :size="18" :stroke-width="2.5" /></span>
    <span>GEO<span class="brand-accent"> Pulse</span></span>
  </NuxtLink>
</template>
