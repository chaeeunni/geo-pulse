<script setup lang="ts">
import { Activity, ChevronDown, CircleHelp, FileText, FlaskConical, LayoutDashboard, LogOut, Menu, Plus, ScanSearch, X } from 'lucide-vue-next'
import { actionSchema, brandSchema, change, emptyData, kstMonth, requireRun, type Action, type AiAction, type Pass, type SubscriptionState, type Workspace } from "#shared/workspace"
import { createDemo, runDemo } from "#shared/demo"

definePageMeta({ layout: false, middleware: 'require-account', key: route => route.query.mode === 'demo' ? 'demo' : 'workspace' })
useSeoMeta({ title: '워크스페이스', robots: 'noindex, nofollow' })
const route = useRoute()
const demo = route.query.mode === 'demo'
const sections = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard, description: '고객 질문에 대한 AI 답변과 이번 달 콘텐츠 성과를 확인하세요.' },
  { id: 'diagnosis', label: 'AI 질문 진단', icon: ScanSearch, description: '고객 질문에 대한 AI 답변과 인용 근거를 확인하세요.' },
  { id: 'content', label: '이번 달 콘텐츠', icon: FileText, description: '진단에서 찾은 기회를 콘텐츠로 준비하고 발행 기록을 남기세요.' },
  { id: 'verification', label: '변화 검증', icon: FlaskConical, description: '같은 질문의 발행 전후 답변을 비교하고 확인한 결과를 반영하세요.' },
]
const section = computed(() => sections.find(entry => entry.id === route.query.view) ?? sections[0]!)
const selected = computed(() => typeof route.query.record === 'string' ? route.query.record : undefined)
const stage = computed(() => typeof route.query.stage === 'string' ? route.query.stage : undefined)
const month = ref(kstMonth())
const dataKey = 'geo-pulse-demo-v1'
const workspaces = ref<Workspace[]>(demo ? createDemo(month.value) : [])
const active = ref(typeof route.query.workspace === 'string' ? route.query.workspace : '')
const workspace = computed(() => workspaces.value.find(entry => entry.id === active.value) ?? workspaces.value[0])
const account = ref('')
const pass = ref<Pass | null>(null)
const subscription = ref<SubscriptionState | null>(null)
const subscriptionMessage = computed(() => subscription.value && {
  active: '매월 자동 갱신됩니다. 결제 내역과 해지는 그로블 주문조회에서 관리할 수 있습니다.',
  payment_failed: '갱신 결제에 실패했습니다. 그로블에서 결제수단과 재시도 상태를 확인해 주세요.',
  cancel_scheduled: '구독 해지가 예약됐습니다. 결제된 이용 기간까지 사용할 수 있습니다.',
  terminated: '구독이 종료됐습니다.',
}[subscription.value])
const available = ref(false)
const menu = ref(false)
const busy = ref(false)
const notice = ref('')
const failure = ref('')
const addOpen = ref(false)
const form = reactive({ name: '', category: '', domain: '', aliases: '', competitors: [{ name: '', domain: '', aliases: '' }] })
const pendingAi = ref<AiAction | null>(null)

function showError(error: unknown) {
  const response = error as { statusCode?: number; data?: { data?: { message?: string } } }
  return response.data?.data?.message ?? (response.statusCode === 401 ? '세션이 만료됐습니다. 다시 로그인해 주세요.' :
    error instanceof Error && !response.statusCode ? error.message : '작업을 완료할 수 없습니다. 잠시 후 다시 시도해 주세요.')
}
const request = useRequestFetch()
const { data: initial, error: initialError } = await useAsyncData(demo ? 'geo-demo' : 'geo-account', async () => {
  if (demo) return { workspaces: [], name: '', available: false }
  const [result, session, sale] = await Promise.all([
    request('/api/app/workspaces'), request('/api/auth/session'), request('/api/billing/product'),
  ])
  return { workspaces: result.workspaces, name: session.user?.name ?? '내 계정', available: sale.available }
})
if (!demo && initial.value) {
  workspaces.value = initial.value.workspaces
  account.value = initial.value.name
  available.value = initial.value.available
}
if (initialError.value) failure.value = showError(initialError.value)
onMounted(() => {
  if (!demo) return
  try {
    const stored = localStorage.getItem(dataKey)
    if (stored) {
      const saved = JSON.parse(stored) as Workspace[]
      if (Array.isArray(saved) && saved.length >= 2 && saved.every(entry => entry.id && entry.brand && Array.isArray(entry.data?.questions))) workspaces.value = saved
    }
  } catch {
    failure.value = '저장된 데모를 불러올 수 없어 기본 샘플을 열었습니다.'
  }
})
watch(workspaces, value => {
  if (demo && import.meta.client) {
    try { localStorage.setItem(dataKey, JSON.stringify(value)) }
    catch { failure.value = '브라우저 공간이 부족해 데모 변경 사항을 저장할 수 없습니다.' }
  }
}, { deep: true, flush: 'post' })

async function refreshPass(id: string) {
  if (demo) return
  try {
    const data = await $fetch('/api/billing/pass', { query: { workspaceId: id } })
    if (workspace.value?.id === id) {
      pass.value = data.pass
      subscription.value = data.subscription
    }
  } catch {
    if (workspace.value?.id === id) {
      pass.value = null
      subscription.value = null
    }
  }
}
if (import.meta.client) onMounted(() => { if (workspace.value) void refreshPass(workspace.value.id) })
watch(() => workspace.value?.id, id => {
  pass.value = null
  subscription.value = null
  pendingAi.value = null
  if (id && import.meta.client) void refreshPass(id)
})
function jump(view: string, id?: string, filter?: string) {
  menu.value = false
  return navigateTo({ path: '/app', query: { ...route.query, view, record: id, stage: filter } }, { replace: true })
}
function setMonth(value: string) {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) month.value = value
}
async function switchBrand(id: string) {
  if (busy.value || !id) return
  active.value = id
  notice.value = ''
  failure.value = ''
  await navigateTo({ path: '/app', query: { ...route.query, workspace: id, record: undefined, stage: undefined } }, { replace: true })
}
async function chartJump(view: string, id?: string, filter?: string) {
  const item = view === 'content' && workspace.value?.data.items.find(entry => entry.id === id)
  if (item) month.value = item.month
  await jump(view, id, filter)
}
function resetMessages() { failure.value = ''; notice.value = '' }
async function dispatch(action: Action): Promise<string | null> {
  const current = workspace.value
  if (!current) return '브랜드를 먼저 추가해 주세요.'
  try {
    const validated = actionSchema.safeParse(action)
    if (!validated.success) return action.type === 'publish' ? 'http 또는 https로 시작하는 유효한 URL을 입력해 주세요.' : '필수 입력을 확인해 주세요.'
    if (demo) {
      const now = new Date().toISOString()
      if ('requestId' in validated.data) runDemo(current, validated.data, now)
      else change(current.data, validated.data, crypto.randomUUID(), now)
    } else {
      const { workspace: updated, error } = await $fetch('/api/app/actions', { method: 'POST', retry: 0, body: { workspaceId: current.id, action: validated.data } })
      const index = workspaces.value.findIndex(entry => entry.id === current.id)
      if (index !== -1) workspaces.value[index] = updated
      if (error) return error
    }
    return null
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (!demo && 'requestId' in action && (!status || status >= 500 || status === 409)) pendingAi.value = action
    return showError(error)
  }
}
async function doAction(action: Action) {
  if (busy.value || !workspace.value) return
  busy.value = true
  resetMessages()
  pendingAi.value = null
  try {
    failure.value = await dispatch(action) ?? ''
    if (!failure.value) {
      notice.value = ({
        saveQuestion: '질문을 저장했습니다.', addItem: '이번 달 콘텐츠 안건에 등록했습니다.', saveDraft: '편집본을 저장했습니다.',
        publish: '발행 URL을 저장했습니다.', apply: '대시보드에 성과를 반영했습니다.', diagnose: '진단을 완료했습니다.',
        generate: '초안을 생성했습니다. 생성된 초안을 열어 확인해 주세요.', verify: '검증 회차를 저장했습니다.',
      })[action.type]
      if (action.type === 'addItem') {
        const data = workspace.value.data
        const run = requireRun(data, action.runId)
        const item = data.items.find(entry => entry.month === action.month && entry.format === run.format &&
          requireRun(data, entry.runId).question.id === run.question.id)
        await jump('content', item?.id)
      }
      if (action.type === 'verify') await jump('verification', action.requestId)
      if (action.type === 'diagnose') await jump('diagnosis', action.requestId, stage.value)
    }
    if ('requestId' in action) await refreshPass(workspace.value.id)
  } finally { busy.value = false }
}
async function batch(ids: string[]) {
  if (busy.value || !workspace.value || !ids.length) return
  busy.value = true
  resetMessages()
  pendingAi.value = null
  let failures = 0
  let firstError = ''
  let lastRun = ''
  try {
    for (const [index, questionId] of ids.entries()) {
      notice.value = (index + 1) + ' / ' + ids.length + '개 질문 진단 중'
      const requestId = crypto.randomUUID()
      const error = await dispatch({ type: 'diagnose', questionId, requestId })
      if (error) {
        failures++
        firstError ||= error
      }
      if (workspace.value.data.runs.some(run => run.id === requestId)) lastRun = requestId
    }
    notice.value = (ids.length - failures) + '개 질문 진단 완료'
    failure.value = failures ? failures + '개 질문 실패 · ' + firstError : ''
    if (lastRun) await jump('diagnosis', lastRun, stage.value)
    await refreshPass(workspace.value.id)
  } finally { busy.value = false }
}
const split = (value: string) => value.split(',').map(entry => entry.trim()).filter(Boolean)
async function createBrand() {
  if (busy.value) return
  resetMessages()
  const parse = brandSchema.safeParse({
    name: form.name, category: form.category, domain: form.domain, aliases: split(form.aliases),
    competitors: form.competitors.filter(entry => entry.name || entry.domain || entry.aliases).map(entry => ({ ...entry, aliases: split(entry.aliases) })),
  })
  if (!parse.success) {
    const field = parse.error.issues.find(issue => issue.path.at(-1) === 'domain')?.path
    failure.value = field
      ? (field[0] === 'competitors' ? '경쟁사 ' + (Number(field[1]) + 1) + '의 공식 도메인' : '브랜드 공식 도메인') +
        '을 확인해 주세요. example.com 또는 https://example.com/처럼 입력할 수 있습니다.'
      : '브랜드명·제품군과 입력한 경쟁사의 이름, 별칭을 확인해 주세요.'
    return
  }
  busy.value = true
  try {
    const result = demo ? { id: crypto.randomUUID(), brand: parse.data, data: emptyData() } :
      (await $fetch('/api/app/workspaces', { method: 'POST', body: parse.data })).workspace
    workspaces.value.push(result)
    active.value = result.id
    addOpen.value = false
    Object.assign(form, { name: '', category: '', domain: '', aliases: '', competitors: [{ name: '', domain: '', aliases: '' }] })
    await navigateTo({ path: '/app', query: { ...route.query, workspace: result.id, view: 'diagnosis', record: undefined, stage: undefined } }, { replace: true })
    notice.value = '브랜드를 추가했습니다. 첫 질문을 등록해 주세요.'
  } catch (error) { failure.value = showError(error) }
  finally { busy.value = false }
}
async function purchase() {
  if (!workspace.value || busy.value) return
  busy.value = true
  resetMessages()
  try {
    const { url } = await $fetch('/api/billing/orders', { method: 'POST', body: { workspaceId: workspace.value.id } })
    window.location.assign(url)
  } catch (error) { failure.value = showError(error) }
  finally { busy.value = false }
}
async function signOut() {
  try { await $fetch('/api/auth/logout', { method: 'POST' }); await navigateTo('/') }
  catch (error) { failure.value = showError(error) }
}
</script>

<template>
  <div class="workspace-shell">
    <aside class="sidebar" :class="{ open: menu }" id="workspace-navigation">
      <BrandMark />
      <div class="brand-switch">
        <label for="brand-select">브랜드 워크스페이스</label>
        <div class="brand-select">
          <span class="workspace-avatar"><Activity :size="19" /></span>
          <select id="brand-select" aria-label="브랜드 선택" :value="workspace?.id ?? ''" :disabled="busy || !workspaces.length" @change="switchBrand(($event.target as HTMLSelectElement).value)">
            <option v-if="!workspaces.length" value="">브랜드 없음</option><option v-for="entry in workspaces" :key="entry.id" :value="entry.id">{{ entry.brand.name }}</option>
          </select>
          <ChevronDown :size="15" />
        </div>
        <button class="sidebar-add" :disabled="busy" @click="addOpen = !addOpen; menu = false"><Plus :size="17" /> 브랜드 추가</button>
      </div>
      <nav aria-label="워크스페이스">
        <button v-for="entry in sections" :key="entry.id" :class="{ active: entry.id === section.id }" :aria-current="entry.id === section.id ? 'page' : undefined" @click="jump(entry.id)"><component :is="entry.icon" :size="19" />{{ entry.label }}</button>
      </nav>
      <div class="sidebar-bottom">
        <div class="side-account"><span class="workspace-avatar">{{ demo ? 'D' : account.slice(0, 1) }}</span><div><strong>{{ demo ? '공개 샘플' : account }}</strong><small>{{ demo ? '예시 데이터' : pass ? '이용권 활성' : '이용권 없음' }}</small></div></div>
        <NuxtLink v-if="demo" to="/app"><CircleHelp :size="17" /> 내 워크스페이스</NuxtLink>
        <button v-else @click="signOut"><LogOut :size="17" /> 로그아웃</button>
      </div>
    </aside>
    <div class="workspace-body">
      <div class="workspace-top">
        <button class="icon-button workspace-toggle" :aria-expanded="menu" aria-controls="workspace-navigation" aria-label="워크스페이스 메뉴" @click="menu = !menu"><X v-if="menu" :size="22" /><Menu v-else :size="22" /></button>
        <span><span class="breadcrumb-root">{{ workspace?.brand.name || '워크스페이스' }}</span><span class="breadcrumb-divider">/</span>{{ section.label }}</span>
        <NuxtLink v-if="demo" class="top-link" to="/">서비스 홈</NuxtLink><NuxtLink v-else class="top-link" to="/pricing">요금</NuxtLink>
      </div>
      <main class="workspace-main">
        <div class="workspace-heading">
          <div><span v-if="demo" class="sample-label"><i /> 예시 데이터</span><h1>{{ section.label }}</h1><p>{{ section.description }}</p></div>
          <label v-if="workspace && (section.id === 'dashboard' || section.id === 'content')" class="month-label">조회 월<input :value="month" type="month" aria-label="조회 월" @change="setMonth(($event.target as HTMLInputElement).value)" /></label>
        </div>
        <section v-if="!demo && workspace && (route.query.purchase === '1' || pass || subscription)" class="panel pass-panel">
          <div>
            <h2>{{ pass?.remaining != null ? '이용권' : '브랜드 월 구독' }}</h2>
            <p v-if="pass">{{ new Date(pass.expiresAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) }} 만료 · {{ pass.remaining === null ? 'AI 무제한 실행' : 'AI 실행 ' + pass.remaining + '회 남음' }}</p>
            <p v-else>{{ workspace.brand.name }}에 사용 가능한 이용권이 없습니다.</p>
            <p v-if="subscriptionMessage">{{ subscriptionMessage }}</p>
          </div>
          <button v-if="available && (!subscription || subscription === 'terminated')" class="button primary" :disabled="busy" @click="purchase">이 브랜드 월 구독 시작</button>
        </section>
        <div v-if="notice" class="notice page-notice" role="status">{{ notice }}</div>
        <div v-if="failure" class="notice danger page-notice" role="alert">{{ failure }} <button v-if="pendingAi" class="text-button" :disabled="busy" @click="doAction(pendingAi)">같은 요청 다시 확인</button></div>
        <section v-if="addOpen" class="panel page-notice">
          <div class="panel-heading"><div><h2>브랜드 추가</h2><p>브랜드의 공식 정보와 비교할 경쟁사를 입력하세요.</p></div><button class="icon-button" aria-label="브랜드 추가 닫기" @click="addOpen = false"><X :size="20" /></button></div>
          <form class="inline-form brand-form" @submit.prevent="createBrand">
            <div class="form-columns"><label>브랜드명<input v-model="form.name" required maxlength="120" /></label><label>제품군<input v-model="form.category" required maxlength="120" /></label></div>
            <div class="form-columns"><label>공식 도메인<input v-model="form.domain" required inputmode="url" placeholder="https://example.com/" /></label><label>브랜드 별칭 (선택)<input v-model="form.aliases" placeholder="쉼표로 구분" /></label></div>
            <fieldset v-for="(entry, i) in form.competitors" :key="i" class="competitor-fields">
              <legend>경쟁사 {{ i + 1 }} (선택)</legend>
              <label>이름<input v-model="entry.name" /></label><label>공식 도메인<input v-model="entry.domain" inputmode="url" placeholder="https://example.com/" /></label><label>별칭<input v-model="entry.aliases" placeholder="쉼표로 구분" /></label>
              <button v-if="form.competitors.length > 1" type="button" class="icon-button" :aria-label="'경쟁사 ' + (i + 1) + ' 제거'" @click="form.competitors.splice(i, 1)"><X :size="18" /></button>
            </fieldset>
            <div class="button-group"><button type="button" class="button secondary" :disabled="form.competitors.length >= 6" @click="form.competitors.push({ name: '', domain: '', aliases: '' })"><Plus :size="16" /> 경쟁사 추가</button><button class="button primary" :disabled="busy">브랜드 저장</button></div>
          </form>
        </section>
        <template v-if="workspace">
          <WorkspaceDashboard v-if="section.id === 'dashboard'" :key="workspace.id" :workspace="workspace" :month="month" @jump="chartJump" @month="setMonth" />
          <WorkspaceDiagnosis v-else-if="section.id === 'diagnosis'" :key="workspace.id" :workspace="workspace" :month="month" :selected="selected" :stage="stage" :busy="busy" :demo="demo" @action="doAction" @batch="batch" @content="jump('content')" />
          <WorkspaceContent v-else-if="section.id === 'content'" :key="workspace.id" :workspace="workspace" :month="month" :selected="selected" :busy="busy" @action="doAction" @jump="jump" />
          <WorkspaceVerification v-else :key="workspace.id" :workspace="workspace" :selected="selected" :busy="busy" @action="doAction" @jump="jump" />
        </template>
        <section v-else-if="!addOpen" class="panel empty-state">
          <Activity :size="29" /><h2>첫 브랜드를 추가해 보세요</h2><p>브랜드를 등록하면 질문 진단과 콘텐츠 계획을 시작할 수 있습니다.</p>
          <button class="button primary" @click="addOpen = true"><Plus :size="17" /> 브랜드 추가</button>
        </section>
      </main>
    </div>
  </div>
</template>
