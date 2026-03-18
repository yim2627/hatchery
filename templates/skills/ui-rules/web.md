# UI 규칙 — Web (React)

- 컴포넌트는 하나의 책임에 집중한다.
- 함수형 컴포넌트 + hooks를 선호한다.
- `useMemo`와 `useCallback`은 측정 가능한 필요가 있을 때만 사용하고, 선제적으로 쓰지 않는다.
- 상태는 소유하는 컴포넌트에 colocate하고, 필요한 경우에만 끌어올린다.
- 비인터랙티브 콘텐츠에는 Server Component 활용을 검토한다(프레임워크 지원 시).
- `useEffect` 의존성을 정직하게 유지한다 — 정당한 이유 없이 린트 억제하지 않는다.
- 기존 스타일링 방식(CSS Modules, Tailwind, styled-components 등)을 존중한다.
- SSR 컨텍스트에서 hydration 불일치를 처리한다.
