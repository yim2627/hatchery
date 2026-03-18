# 동시성 규칙 — iOS (Swift Concurrency + Swift 6)

## Swift 6 Strict Concurrency 체크리스트

- [ ] 모든 shared mutable state가 actor 또는 Sendable로 보호
- [ ] `@MainActor`가 UI 레이어(ViewModel/Presenter/View)에만 적용
- [ ] 모든 actor 경계를 넘는 값이 `Sendable` 준수
- [ ] `@preconcurrency` 사용 시 마이그레이션 계획 있음
- [ ] `nonisolated` 키워드가 의도적으로만 사용됨
- [ ] `@unchecked Sendable` 사용 시 코멘트로 정당화됨
- [ ] `Task.detached` 사용 시 명시적 정당화 있음
- [ ] 모든 `withCheckedContinuation` / `withCheckedThrowingContinuation`에서 정확히 1회 resume

---

## 결정 다이어그램: 동시성 도구 선택

```
비동기 작업이 필요한가?
├── 아니오 → 동기 함수 사용
└── 예
    ├── 여러 작업을 병렬로 실행?
    │   ├── 예
    │   │   ├── 작업 수가 컴파일 타임에 고정? → async let
    │   │   └── 작업 수가 런타임에 동적?   → TaskGroup / ThrowingTaskGroup
    │   └── 아니오 (순차 실행) → await 체이닝
    └── 단일 비동기 작업 시작?
        ├── SwiftUI View 수명에 연결? → .task { } 수정자
        ├── 부모 Task의 취소를 상속해야 하는가? → Task { }
        └── 독립적 실행이 필요한가? → Task.detached (주의: 취소 전파 끊김)
```

---

## 결정 다이어그램: Sendable 준수 방법

```
타입이 actor 경계를 넘는가?
├── 아니오 → Sendable 불필요
└── 예
    ├── enum (연관값 없음)? → 자동 Sendable
    ├── enum (연관값 있음)? → 모든 연관값이 Sendable이면 자동 준수
    ├── struct (값 타입)?
    │   ├── 모든 저장 프로퍼티가 Sendable? → 자동 Sendable 준수
    │   └── non-Sendable 프로퍼티 있음? → 해당 프로퍼티를 Sendable로 변환
    ├── class?
    │   ├── final + 모든 프로퍼티가 let + Sendable? → Sendable 선언
    │   ├── mutable state 있음?
    │   │   ├── actor로 변환 가능? → actor 사용 (권장)
    │   │   └── actor 불가? → @unchecked Sendable + 내부 잠금(Lock/Mutex) + 코멘트
    │   └── 상속 필요? → final 불가 → @unchecked Sendable + 잠금
    └── 클로저 / 함수 타입? → @Sendable 어노테이션 + 캡처값 모두 Sendable
```

---

## Actor 격리 규칙

### @MainActor는 UI 레이어에만
- `@MainActor`: ViewModel, Presenter, View에만 적용한다. Domain/Data 레이어에 절대 붙이지 않는다.
  - **WHY**: Domain이 `@MainActor`에 묶이면 테스트에서 MainActor 의존성이 생기고, 백그라운드 실행이 불가능해진다. 레이어 분리가 무너진다.

### nonisolated는 프로토콜 준수에서만
- `nonisolated`: 동기 접근이 필요한 프로토콜 요구사항 충족에서만 사용한다.
  - **WHY**: actor의 격리를 해제하면 data race가 가능해진다. 프로토콜 요구사항 충족 외에는 사용하지 않는다.

### GlobalActor 남용 금지
- 전체 모듈이나 대규모 클래스에 `@MainActor`를 걸지 않는다.
  - **WHY**: 불필요한 actor hop이 발생하고, 백그라운드에서 실행 가능한 로직까지 메인 스레드로 끌려와 성능이 저하된다.

### actor 재진입 인지
- `await` 전후로 actor 내부 상태가 변경될 수 있음을 항상 인지한다.
  - **WHY**: actor는 `await` 지점에서 다른 호출을 받아들인다. `await` 전에 읽은 값이 `await` 후에도 유효하다고 가정하면 논리 오류가 발생한다.

---

## Task 생명주기 규칙

### .task { } 수정자 우선 사용
- SwiftUI에서는 `Task { }` 대신 `.task { }` 수정자를 사용한다. View가 사라지면 자동 취소된다.
  - **WHY**: `Task { }`를 수동 관리하면 취소 누락과 메모리 릭이 발생한다. `.task { }`는 View 생명주기에 자동으로 바인딩된다.

### 이전 Task를 cancel()한 후 새 Task 시작
- 검색, 새로고침 등 반복 트리거되는 작업은 이전 Task를 `cancel()`한 후 새 Task를 시작한다.
  - **WHY**: 이전 요청의 응답이 늦게 도착하면 최신 상태를 덮어쓰는 race condition이 발생한다.

### 협력적 취소 구현
- `Task.isCancelled` 또는 `try Task.checkCancellation()`으로 취소에 협력한다.
  - **WHY**: Swift의 Task 취소는 협력적(cooperative)이다. 체크하지 않으면 취소 요청을 무시하고 불필요한 작업이 계속된다.

### Task.detached는 정당화 필요
- `Task.detached`는 부모의 actor 컨텍스트와 취소 전파를 모두 끊는다. 명시적 이유 없이 사용하지 않는다.
  - **WHY**: 취소가 전파되지 않아 리소스 릭이 발생하고, actor 격리가 해제되어 예상치 못한 스레드에서 실행된다.

---

## Sendable 경계 규칙

### @Sendable 클로저의 캡처
- 클로저가 `@Sendable`이면 캡처하는 모든 값이 `Sendable`이어야 한다.
  - **WHY**: Swift 6에서 non-Sendable 캡처는 컴파일 에러다. Swift 5 모드에서도 경고가 발생하며, 런타임 data race의 원인이 된다.

### @unchecked Sendable은 최후의 수단
- `@unchecked Sendable`은 성능이 증명된 경우에만 사용하고, 반드시 코멘트로 정당화한다.
  - **WHY**: 컴파일러의 안전 검증을 우회한다. 실수로 data race가 생겨도 컴파일러가 잡아주지 못한다.

### 값 타입(struct) 우선
- actor 경계를 넘기는 데이터는 가능한 한 struct(값 타입)로 모델링한다.
  - **WHY**: 값 타입은 복사 의미론이므로 공유 상태 문제가 원천적으로 없다. Sendable 자동 준수도 쉽다.

---

## 기존 규칙 (호환성)

- 콜백 피라미드보다 `async/await`를 사용한다(프로젝트 호환 시).
- 값이 actor나 Task를 넘어갈 때 `Sendable` 경계를 검증한다.
- 동기 nonisolated 컨텍스트에서 actor-isolated API를 호출하지 않는다.
- 실행 의미론이 중요할 때 `nonisolated` async 동작을 명시적으로 표현한다.
- `@preconcurrency`나 레거시 import로 동시성 진단을 억제하기 전에 감사한다.
- 취소된 이전 Task가 최신 요청의 상태를 덮어쓰지 않는지 확인한다.
- 반복 탭 / 반복 새로고침 / 화면 재진입 동작을 고려한다.
