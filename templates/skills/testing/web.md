# 테스트 규칙 — Web

- 프로젝트에서 확립된 테스트 러너(Vitest, Jest, Playwright, Cypress)를 사용한다.
- Testing Library로 컴포넌트 동작을 테스트한다 — 구현이 아닌 role 기준으로 쿼리한다.
- API 호출은 MSW(Mock Service Worker) 등으로 mock한다.
- 로직이 비자명한 hooks는 `renderHook`으로 독립 테스트한다.
- E2E: 모든 순열이 아닌 핵심 유저 플로우를 테스트한다.
- Next.js에서: Server Component와 Client Component를 다르게 테스트한다.
- 스냅샷 테스트는 최소화하고, 명시적 단언(assertion)을 선호한다.
