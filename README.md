# GEO Pulse

고객 질문에 대한 AI 답변을 진단하고 콘텐츠 발행 전후를 비교하는 브랜드 워크스페이스입니다. [제품 요구사항](PRD.md)과 [디자인 참고자료](DESIGN-mercury.md)를 바탕으로 Nuxt 4에서 구현했습니다.

## 로컬 실행

Node.js 22.12 이상(22 LTS) 또는 24 LTS와 npm을 사용합니다.

```sh
npm ci
npm run dev
```

루트 `/`는 홈, `/pricing`은 요금, `/app?mode=demo`는 공개 샘플입니다. 데모는 라움 오디오와 클라우드노트의 가상 데이터를 사용하고 변경 사항을 브라우저에 저장합니다. 실제 AI 호출과 결제는 환경 설정을 연결한 계정 워크스페이스 `/app`에서 사용할 수 있습니다.

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

## 프리뷰 연동 설정

1. `.env.example`을 `.env`로 복사해 로컬 설정을 작성합니다. 배포할 때는 동일한 변수 이름을 Vercel Preview 환경에 등록합니다. `NUXT_SITE_URL`은 실제 접속할 단일 오리진과 일치해야 합니다. 기본적으로 검색 색인은 꺼져 있습니다.
2. 프리뷰 전용 Supabase 프로젝트에 `supabase/migrations`를 적용합니다. Kakao와 Google 개발자 콘솔에 Supabase 콜백을 등록하고, Supabase의 Redirect URLs에는 프리뷰 사이트의 `/auth/callback` 경로를 허용합니다. Kakao 이메일 동의를 받지 않는 구성은 Supabase에서 이메일 없는 계정을 허용해야 합니다. Supabase 서버 키는 브라우저에 노출하지 않습니다.
3. 서버에 Gemini API 키를 등록합니다. 기본 모델은 `gemini-4-hydrogen`입니다. 해당 프로젝트에서 모델 조회와 Search Grounding 요청을 확인하고 필요하면 승인된 모델로 변경합니다. 결제된 월 구독 기간에는 질문 진단, 초안 생성, 검증을 무제한 실행할 수 있습니다. 기존 단건 이용권의 실행 횟수는 계속 적용됩니다.
4. 결제를 검수할 때는 아래 그로블 설정 절차를 따릅니다.
5. Vercel에서 Nuxt 프레임워크와 Node.js 22.x를 사용해 Preview로 배포합니다. Preview 접근 보호를 유지하고 테스트용 서비스 설정만 사용합니다. 공개 운영 환경에서는 운영 오리진, 실제 상품, 검색 도구 설정이 확정된 뒤 `NUXT_INDEX_PUBLIC=true`를 적용합니다.

## 그로블 월 구독 연결

운영에는 그로블의 기존 월 3,800원 정기결제 결제창과 월 옵션 하나를 사용합니다. 테스트에는 별도 결제창과 서명 키를 사용합니다. 양쪽 모두 수량은 1개이며, 실제 청구 금액은 사이트에 설정한 가격과 일치해야 합니다. 정기결제 SQL 마이그레이션을 먼저 적용한 뒤 앱을 배포합니다. [결제창 연동 가이드](https://www.groble.im/help/guides/payment-window)

| Vercel 환경 변수 이름 | 넣을 값 |
| --- | --- |
| `NUXT_GROBLE_SUBSCRIPTION_CHECKOUT_URL` | 그로블에서 복사한 월 구독 결제창 링크 |
| `NUXT_GROBLE_SUBSCRIPTION_PRODUCT_ID` | 정기결제 완료 통지의 `content.id` |
| `NUXT_GROBLE_SUBSCRIPTION_OPTION_ID` | 정기결제 완료 통지의 `options[0].optionId` |
| `NUXT_GROBLE_WEBHOOK_SECRET` | 그로블 웹훅 설정에서 발급한 서명 키. Vercel에 비밀 값으로 직접 입력 |
| `NUXT_PASS_PRICE` | 월 청구 금액. 운영 기본값은 3800원 |
| `NUXT_REFUND_TERMS` | 상품에 적용할 환불 조건 |

- 검수 주소를 기준으로 그로블의 **진입 페이지**를 `/pricing`, **결제 후 이동 페이지**를 `/billing/result`로 지정합니다. 각 경로 앞에 같은 HTTPS 사이트 주소를 붙입니다.
- 그로블 **내 스토어 → 연동**에서 같은 사이트의 `/api/billing/webhook` 주소를 등록합니다. `subscription_payment.completed`, `subscription_payment.failed`, `subscription_payment.refunded`, `subscription.cancel_requested`, `subscription.terminated`를 선택합니다. 기존 단건 거래의 결제와 환불 통지는 계속 같은 주소에서 받습니다. 테스트 배포가 접근 보호를 사용하면 그로블의 통지 요청에만 맞는 Vercel 접근 설정을 적용합니다. [그로블 이벤트 안내](https://www.groble.im/help/guides/webhook-events) · [Vercel 웹훅 접근 설정](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)
- 로그인과 AI 설정까지 연결한 뒤 `/pricing`에서 **월 구독 시작**을 누르고 브랜드를 선택합니다. 결제 통지 전에는 **결제 확인 중**입니다. 최초 결제와 갱신을 검수하고 워크스페이스에 다음 결제일까지의 이용 기간과 **AI 무제한 실행**이 보이는지 확인합니다. 중복 결제 통지와 갱신 실패로 기간이 늘어나지 않는지, 해지 요청과 완료가 올바른 시점에 반영되는지, 부분 환불 누적액이 결제 전액에 도달하면 해당 회차만 회수되는지 확인합니다.

### 처리 방식

워크스페이스 문서는 데이터베이스의 버전 번호로 동시 갱신을 제어합니다. 구독의 결제 회차와 완료된 환불에서 이용 권한을 계산합니다. 연결에 실패한 통지는 검토 상태로 기록하며, 같은 통지와 거래를 다시 받아도 기간을 중복 부여하지 않습니다. 검증은 발행 URL을 프롬프트에 추가하지 않고 저장된 질문을 재실행합니다.
