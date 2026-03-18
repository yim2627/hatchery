# 네트워킹 규칙 — Web

- 프로젝트에서 확립된 HTTP 클라이언트(fetch, axios, ky 등)를 사용한다.
- Next.js에서: mutation에는 Server Actions / Route Handlers, 읽기에는 RSC 데이터 페칭을 선호한다.
- 클라이언트 캐시와 refetch 관리에는 React Query / SWR / TanStack Query를 활용한다(확립된 경우).
- 데이터 페칭 훅에서 loading, error, stale 상태를 처리한다.
- 적절한 `Cache-Control`과 revalidation 전략을 설정한다.
- 취소 가능한 요청에는 `AbortController`를 사용한다.
- 워터폴 요청을 피한다 — 독립적인 데이터 페치를 병렬화한다.
