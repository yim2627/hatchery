# 동시성 규칙 — iOS (Swift Concurrency)

- 콜백 피라미드보다 `async/await`를 사용한다(프로젝트 호환 시).
- 값이 actor나 Task를 넘어갈 때 `Sendable` 경계를 검증한다.
- 동기 nonisolated 컨텍스트에서 actor-isolated API를 호출하지 않는다.
- 실행 의미론이 중요할 때 `nonisolated` async 동작을 명시적으로 표현한다.
- 명시적 정당화 없이 detached task를 사용하지 않는다.
- `@preconcurrency`나 레거시 import로 동시성 진단을 억제하기 전에 감사한다.
- 취소된 이전 Task가 최신 요청의 상태를 덮어쓰지 않는지 확인한다.
- 반복 탭 / 반복 새로고침 / 화면 재진입 동작을 고려한다.
