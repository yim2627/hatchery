# 상태 관리 규칙 — Web

- 전역 상태를 쓰기 전에 소유 컴포넌트에 상태를 colocate한다.
- 프로젝트에 확립된 상태 관리 라이브러리(Zustand, Redux, Jotai 등)를 사용한다.
- React에서: 서버 상태(React Query/SWR)와 클라이언트 상태(useState/Zustand)를 구분한다.
- 중복 상태를 피한다 — 기존 상태나 URL 파라미터에서 값을 파생한다.
- 네비게이션 관련 상태는 URL을 source of truth로 유지한다.
- Next.js App Router에서: 초기 데이터는 클라이언트 상태보다 서버 사이드 데이터 페칭을 선호한다.
- 여러 전이가 있는 복잡한 로컬 상태에는 `useReducer`를 사용한다.
