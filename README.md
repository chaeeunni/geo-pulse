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
3. 서버에 Gemini API 키를 등록합니다. 기본 모델은 `gemini-4-hydrogen`입니다. 해당 프로젝트에서 모델 조회와 Search Grounding 요청을 확인하고 필요하면 승인된 모델로 변경합니다. 성공한 질문 진단, 초안 생성, 검증은 각각 이용권의 AI 실행 1회를 사용합니다.
4. 결제를 검수할 때는 아래 그로블 설정 절차를 따릅니다.
5. Vercel에서 Nuxt 프레임워크와 Node.js 22.x를 사용해 Preview로 배포합니다. Preview 접근 보호를 유지하고 테스트용 서비스 설정만 사용합니다. 공개 운영 환경에서는 운영 오리진, 실제 상품, 검색 도구 설정이 확정된 뒤 `NUXT_INDEX_PUBLIC=true`를 적용합니다.

## 그로블 30일 이용권 연결

그로블 **내 스토어 → 상품 관리**에서 30일 이용권으로 사용할 단건 결제창과 옵션 하나를 준비합니다. 결제 수량을 1로 제한하고, 검수하는 동안 할인 적용 후 결제 금액도 아래 가격과 일치하도록 설정합니다. [결제창 연동 가이드](https://www.groble.im/help/guides/payment-window)

| Vercel 환경 변수 이름 | 넣을 값 |
| --- | --- |
| `NUXT_GROBLE_CHECKOUT_URL` | 그로블에서 복사한 결제창 링크 |
| `NUXT_GROBLE_PRODUCT_ID` | 결제 완료 이벤트의 `content.id` |
| `NUXT_GROBLE_OPTION_ID` | 결제 완료 이벤트의 `options[0].optionId` |
| `NUXT_GROBLE_WEBHOOK_SECRET` | 그로블 웹훅 설정에서 발급한 서명 키. Vercel에 비밀 값으로 직접 입력 |
| `NUXT_PASS_PRICE` | 결제창에 표시되는 최종 결제 금액. 원 단위 숫자 |
| `NUXT_PASS_CREDITS` | 이용권에 포함할 AI 실행 횟수 |
| `NUXT_REFUND_TERMS` | 상품에 적용할 환불 조건 |

- 검수 주소를 기준으로 그로블의 **진입 페이지**를 `/pricing`, **결제 후 이동 페이지**를 `/billing/result`로 지정합니다. 각 경로 앞에 같은 HTTPS 사이트 주소를 붙입니다.
- 그로블 **내 스토어 → 연동**에서 같은 사이트의 `/api/billing/webhook` 주소를 등록하고 `payment.completed`와 `payment.refunded`를 선택합니다. 보호된 Vercel 프리뷰에서 그로블이 웹훅을 보낼 때는 Vercel 자동화 우회 설정이 필요합니다. 그로블 서명 키와 Vercel 우회 값은 각각 해당 설정 화면에서 직접 입력합니다. [웹훅 연동 가이드](https://www.groble.im/help/guides/webhook) · [Vercel 웹훅 접근 설정](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)
- 로그인과 진단 설정까지 연결되면 `/pricing`에서 **30일 이용권 구매**를 눌러 브랜드를 선택합니다. 결제 복귀 화면이 먼저 열리면 **결제 확인 중**으로 표시됩니다. 서명된 결제 완료 이벤트가 처리되면 워크스페이스에서 만료일과 포함 횟수를 확인합니다. 같은 이벤트를 다시 보내도 이용권이 늘어나지 않고, 환불 완료 이벤트가 처리되면 해당 거래의 이용권이 회수되는지 확인합니다.

### 처리 방식

워크스페이스 문서는 데이터베이스의 버전 번호로 동시 갱신을 제어합니다. 결제·이용권·AI 요청은 별도 테이블에 보관하고 권한 변동과 사용량은 DB에서 갱신합니다. 웹훅에서 주문에 연결할 수 없는 서명 이벤트는 검토 상태로 기록합니다. 환불이 확인되면 해당 거래의 패스를 회수합니다. 검증은 발행 URL을 프롬프트에 추가하지 않고 저장된 질문을 재실행합니다.
