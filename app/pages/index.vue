<script setup lang="ts">
import { Activity, ChartNoAxesCombined, CircleCheck, Compass, FileText, Search, Target } from 'lucide-vue-next'
await usePageSeo('/', 'AI 브랜드 언급 분석과 콘텐츠 성과 검증', '고객 질문에 대한 AI 답변에서 브랜드 언급과 인용을 확인하고, 콘텐츠 발행 후 달라진 답변을 검증하세요.')

const steps = [
  { icon: Search, title: 'AI에 나오는 답을 확인하세요', body: '고객이 실제로 묻는 질문으로 진단을 실행합니다. 답변 원문, 검색 출처, 추천 순위를 한곳에서 확인하세요.' },
  { icon: FileText, title: '이번 달에 만들 콘텐츠를 정하세요', body: '답변에 빠진 근거를 보고 콘텐츠 안건을 등록합니다. 필요한 자료부터 Markdown 초안까지 준비하세요.' },
  { icon: ChartNoAxesCombined, title: '발행 후 달라진 답을 비교하세요', body: '같은 질문을 다시 실행해 새로 생긴 인용과 순위 변화를 확인하고, 검토한 결과를 대시보드에 반영하세요.' },
]
</script>

<template>
  <div class="home">
    <section class="home-hero">
      <div class="container hero-content">
        <div class="hero-copy">
          <div class="hero-signal"><Activity :size="17" /> AI 검색 성과 워크스페이스</div>
          <h1>AI는 지금<br />당신의 브랜드를<br /><em>어떻게 말하나요?</em></h1>
          <p>고객의 질문에 AI가 어떤 답을 하는지 살펴보세요. 빠진 근거를 콘텐츠로 채우고, 발행 전후의 변화를 확인하세요.</p>
          <div class="button-group">
            <NuxtLink class="button primary" to="/app">내 브랜드 진단 시작</NuxtLink>
            <NuxtLink class="button secondary dark-secondary" to="/app?mode=demo">샘플 둘러보기</NuxtLink>
          </div>
        </div>
        <div class="hero-visual" aria-label="GEO Pulse 가상 데이터 화면">
          <div class="visual-top">
            <div><span class="mock-brand-icon"><Activity :size="18" /></span><strong>라움 오디오</strong></div>
            <span class="mock-note">예시 데이터</span>
          </div>
          <div class="visual-heading"><p>이번 달 성과</p><Compass :size="20" /></div>
          <div class="mock-metrics">
            <div><span>브랜드 언급률</span><strong>60<span>%</span></strong></div>
            <div><span>공식 출처 인용률</span><strong>40<span>%</span></strong></div>
            <div><span>평균 추천 순위</span><strong>2.0<span>위</span></strong></div>
          </div>
          <div class="hero-chart">
            <div class="hero-chart-title"><span>브랜드 언급 추이</span><span>최근 6개월</span></div>
            <svg viewBox="0 0 480 139" role="img" aria-label="브랜드 언급률 예시 추이">
              <defs><linearGradient id="hero-area" x2="0" y2="1"><stop stop-color="#a6aafa" stop-opacity=".43"/><stop offset="1" stop-color="#a6aafa" stop-opacity="0"/></linearGradient></defs>
              <path d="M0 18H480 M0 52H480 M0 86H480 M0 120H480" stroke="#ffffff" stroke-opacity=".10" />
              <path d="M3 102 C45 102 57 77 99 77 S150 91 194 85 245 61 290 58 341 65 386 43 442 30 477 24 V122 H3Z" fill="url(#hero-area)" />
              <path d="M3 102 C45 102 57 77 99 77 S150 91 194 85 245 61 290 58 341 65 386 43 442 30 477 24" stroke="#aab5ff" stroke-width="3" fill="none" />
              <circle cx="477" cy="24" r="4" fill="#e0e4ff" />
            </svg>
          </div>
          <div class="mock-result"><CircleCheck :size="17" /><span>새로운 공식 출처 인용을 확인했어요</span></div>
        </div>
      </div>
    </section>
    <section id="workflow" class="home-workflow container">
      <div class="section-heading"><h2>질문에서 성과까지</h2><p>진단, 콘텐츠 제작, 발행 후 검증을 한 워크스페이스에서 진행하세요.</p></div>
      <div class="step-grid">
        <article v-for="step in steps" :key="step.title" class="step-card">
          <span class="feature-icon"><component :is="step.icon" :size="23" /></span>
          <h3>{{ step.title }}</h3><p>{{ step.body }}</p>
        </article>
      </div>
      <div class="sample-callout"><div><Target :size="25" /><div><h3>라움 오디오의 첫 진단을 살펴보세요</h3><p>가상의 휴대용 스피커 브랜드가 어떤 질문에서 콘텐츠 기회를 찾았는지 확인할 수 있어요.</p></div></div><NuxtLink to="/app?mode=demo" class="button primary">공개 샘플 열기</NuxtLink></div>
    </section>
  </div>
</template>
