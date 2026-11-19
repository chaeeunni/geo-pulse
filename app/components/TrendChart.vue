<script setup lang="ts">
const props = defineProps<{
  points: { month: string; value: number | null; count: number; milestone?: string }[]
  rank?: boolean
  comparison?: { value: number | null; count: number }[]
  comparisonLabel?: string
}>()
const emit = defineEmits<{ select: [month: string]; publication: [month: string] }>()
const labels = computed(() => props.rank ? [1, 2, 3, 4, 5].concat(limit.value > 5 ? [limit.value] : []) : [100, 75, 50, 25, 0])
const limit = computed(() => Math.max(5, ...props.points.map(point => point.value ?? 0), ...(props.comparison ?? []).map(point => point.value ?? 0)))
const x = (index: number) => 48 + index * 118
const y = (value: number) => 15 + 135 * (props.rank ? ((value - 1) / (limit.value - 1)) : (1 - value / 100))
function lines(points: { value: number | null }[]) {
  let next = 'M'
  return points.map(({ value }, i) => {
    if (value === null) { next = 'M'; return '' }
    const command = next + x(i) + ' ' + y(value)
    next = 'L'
    return command
  }).join(' ')
}
</script>

<template>
  <div class="trend-chart">
    <svg viewBox="0 0 680 179" role="img" :aria-label="rank ? '최근 6개월 추천 순위' : '최근 6개월 성과 비율'">
      <defs>
        <linearGradient id="trend-fill" x2="0" y2="1">
          <stop stop-color="#7585ff" stop-opacity=".22" /><stop offset="1" stop-color="#7585ff" stop-opacity="0" />
        </linearGradient>
      </defs>
      <g v-for="label in labels" :key="label">
        <line x1="45" x2="647" :y1="y(label)" :y2="y(label)" stroke="currentColor" class="grid-line" />
        <text x="34" :y="y(label) + 4" text-anchor="end" class="chart-label">{{ label }}{{ rank ? '위' : '%' }}</text>
      </g>
      <path v-if="!rank && points.every(point => point.value !== null)" :d="lines(points) + ' L638 150 L48 150 Z'" fill="url(#trend-fill)" />
      <path v-if="comparison" :d="lines(comparison)" fill="none" stroke="#a394e9" stroke-width="2" stroke-dasharray="5 5" />
      <path :d="lines(points)" fill="none" stroke="#6374f3" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <g v-for="(point, i) in points" :key="point.month">
        <circle v-if="point.value !== null" :cx="x(i)" :cy="y(point.value)" r="4.5" class="chart-point">
          <title>{{ point.month }} · {{ point.value }}{{ rank ? '위' : '%' }} · 질문 버전 {{ point.count }}개</title>
        </circle>
        <text :x="x(i)" y="173" text-anchor="middle" class="chart-label">{{ Number(point.month.slice(5)) }}월</text>
      </g>
    </svg>
    <div class="chart-links">
      <button v-for="point in points" :key="point.month" class="text-button" type="button" @click="point.milestone ? emit('publication', point.month) : emit('select', point.month)">
        {{ Number(point.month.slice(5)) }}월<span v-if="point.milestone"> · 배포</span>
      </button>
    </div>
    <div v-if="comparisonLabel" class="chart-legend"><span />{{ comparisonLabel }}</div>
  </div>
</template>
