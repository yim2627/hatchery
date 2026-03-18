# 상태 관리 규칙

UI 상태, 데이터 흐름, 상태 전이와 관련된 작업에 이 스킬을 적용한다.

## 핵심 원칙

- UI 상태는 명시적이고 테스트 가능해야 한다.
- 결정적(deterministic) 상태 전이를 선호한다.
- 숨겨진 암묵적 상태 변경을 피한다.
- 해당되는 곳에서 initial, loading, success, empty, error, permission-denied 상태를 구분한다.
- 상태의 소유권을 명확하게 유지한다 — 각 상태에 대해 하나의 source of truth를 둔다.
