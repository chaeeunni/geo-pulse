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
4. 그로블에서 검수용 단건 상품과 수량 1의 단일 옵션을 만듭니다. 상품·옵션 ID, 최종 KRW 가격, 포함 횟수 및 확정 환불 안내를 등록합니다. 결제창의 복귀 주소는 `/billing/result`, 웹훅은 `/api/billing/webhook`입니다. `payment.completed`, `payment.refunded`를 선택합니다. 보호된 Vercel 프리뷰는 웹훅 URL에 자동화 우회 값을 등록합니다. 결제 완료·중복·불일치·환불 서명 이벤트를 프리뷰 환경에서 검수합니다.
5. Vercel에서 Nuxt 프레임워크와 Node.js 22.x를 사용해 Preview로 배포합니다. Preview 접근 보호를 유지하고 테스트용 서비스 설정만 사용합니다. 공개 운영 환경에서는 운영 오리진, 실제 상품, 검색 도구 설정이 확정된 뒤 `NUXT_INDEX_PUBLIC=true`를 적용합니다.

### 처리 방식

워크스페이스 문서는 데이터베이스의 버전 번호로 동시 갱신을 제어합니다. 결제·이용권·AI 요청은 별도 테이블에 보관하고 권한 변동과 사용량은 DB에서 갱신합니다. 웹훅에서 주문에 연결할 수 없는 서명 이벤트는 검토 상태로 기록합니다. 환불이 확인되면 해당 거래의 패스를 회수합니다. 검증은 발행 URL을 프롬프트에 추가하지 않고 저장된 질문을 재실행합니다.
