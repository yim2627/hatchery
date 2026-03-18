# 동시성 규칙 — Web

- 가독성을 위해 `.then()` 체인보다 `async/await`를 사용한다.
- 취소 가능한 fetch 요청에는 `AbortController`를 처리한다.
- 미처리 promise rejection을 피한다 — 항상 catch하거나 전파한다.
- 독립적으로 실패할 수 있는 여러 요청에는 `Promise.allSettled`를 사용한다.
- React에서: `useEffect` cleanup에서 진행 중인 요청을 취소한다.
- Next.js에서: 가능하면 Suspense 경계와 스트리밍을 활용한다.
- 빠른 유저 인터랙션에서의 경쟁 조건을 고려한다(debounce, latest-only 패턴).
- 메인 스레드를 차단할 CPU 집약적 작업에는 Web Worker를 사용한다.
