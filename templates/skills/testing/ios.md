# 테스트 규칙 — iOS

## Swift Testing 시대의 테스트 체크리스트

- [ ] 프로젝트의 테스트 프레임워크(Swift Testing 또는 XCTest)를 일관되게 사용
- [ ] ViewModel/Service를 결정적 입력으로 테스트 (외부 의존성 격리)
- [ ] 핵심 의존성만 Mock/Fake로 대체 (4개 이상 mock은 설계 문제)
- [ ] 비동기 테스트에서 sleep 대신 조건 기반 대기 사용
- [ ] happy path뿐 아니라 에러/엣지 케이스도 테스트
- [ ] 테스트 이름이 무엇을 검증하는지 설명 (given_when_then)
- [ ] 각 테스트가 독립적으로 실행 가능 (테스트 간 상태 공유 금지)
- [ ] @MainActor 격리가 필요한 테스트에 명시적으로 적용
- [ ] 파라미터화 테스트로 반복 코드 제거 (@Test(arguments:))
- [ ] 구현 세부사항이 아닌 최종 동작(결과)을 검증

## 결정 다이어그램: 테스트 전략 선택

```
"무엇을 테스트하려는가?"
│
├─ "비즈니스 로직 (계산, 변환, 상태 전이)"
│   └─→ Unit Test
│       WHY: 빠르고 결정적. 외부 의존성 없이 로직만 검증.
│       대상: ViewModel, UseCase, Repository, 유틸리티 함수
│
├─ "여러 컴포넌트 간 통합 동작"
│   └─→ Integration Test
│       WHY: 컴포넌트 간 계약이 실제로 작동하는지 검증.
│       대상: Repository + API Client, ViewModel + Repository
│       mock: 외부 시스템(네트워크, DB)만 mock
│
├─ "유저 시나리오 (탭, 입력, 네비게이션)"
│   └─→ UI Test (XCUITest)
│       WHY: 실제 앱 프로세스에서 유저 동선을 자동 검증.
│       주의: 느리고 flaky할 수 있음. 핵심 시나리오만.
│
└─ "스냅샷/레이아웃 일관성"
    └─→ Snapshot Test
        WHY: 의도하지 않은 UI 변경을 이미지 비교로 감지.
```

## 결정 다이어그램: Test Double 선택

```
"테스트에서 의존성을 어떻게 대체할 것인가?"
│
├─ "호출 여부만 확인하면 됨"
│   └─→ Spy (호출 기록)
│       WHY: 메서드가 호출되었는지, 몇 번 호출되었는지만 검증.
│
├─ "고정된 값을 반환하면 됨"
│   └─→ Stub (고정 반환)
│       WHY: 특정 시나리오를 재현하기 위해 항상 같은 값 반환.
│
├─ "실제와 유사한 동작이 필요"
│   └─→ Fake (간이 구현)
│       WHY: in-memory DB, 로컬 파일 등으로 실제 동작을 시뮬레이션.
│            Mock보다 실제에 가까워서 신뢰도가 높다.
│
└─ "호출 순서/횟수/인자를 정밀 검증"
    └─→ Mock (엄격한 기대값)
        WHY: 정확한 호출 패턴을 검증. 단, 구현 세부사항에 결합될 위험.
        주의: 과도한 mock은 리팩토링 시 테스트가 깨지는 원인.
```

## Swift Testing 매크로 규칙

- `@Test`로 테스트를 선언하고, `#expect`로 단언한다
  - WHY: Swift Testing은 매크로 기반으로 XCTest보다 간결하고 표현력이 높다.
- `@Test(arguments:)`로 파라미터화 테스트를 작성한다
  - WHY: 같은 로직을 다른 입력으로 검증할 때 테스트 함수를 복사하지 않아도 된다.
- `@Suite`로 관련 테스트를 그룹화하고 `.tags()`로 분류한다
  - WHY: 태그로 특정 카테고리의 테스트만 선택 실행할 수 있다 (예: .networking 태그만).
- `#expect(throws:)`로 에러 타입을 검증한다
  - WHY: XCTest의 XCTAssertThrowsError보다 타입 수준의 에러 검증이 간결하다.

## 비동기 테스트 규칙

- 비동기 테스트는 `async throws` 메서드로 선언한다
  - WHY: completion handler + XCTestExpectation 패턴보다 코드가 절반 이하로 줄어든다.
- `sleep` 대신 조건 기반 대기를 사용한다
  - WHY: 고정 대기(sleep)는 느리고 불안정하다. CI 환경에서 타이밍 차이로 flaky해진다.
- Swift Testing의 `confirmation`으로 비동기 이벤트를 검증한다
  - WHY: XCTestExpectation의 Swift Testing 대응. fulfill 없이 클로저 기반으로 간결하다.

## Mock/Fake 규칙

- 프로토콜 기반으로 의존성을 추상화하고 테스트에서 대체한다
  - WHY: 구체 타입에 의존하면 테스트에서 실제 네트워크/DB를 호출하게 된다.
- 테스트당 Mock은 최대 2-3개로 제한한다
  - WHY: Mock이 4개 이상이면 테스트 대상의 의존성이 너무 많다는 설계 신호다.
- Mock보다 Fake를 선호한다
  - WHY: Fake는 실제 동작을 시뮬레이션하므로 구현 세부사항에 덜 결합된다.

## 테스트 네이밍 규칙

- `test_행위_조건_기대결과` 또는 `행위_조건_기대결과` 형식을 사용한다
  - WHY: 테스트가 실패했을 때 이름만 보고 무엇이 깨졌는지 파악할 수 있다.
- Swift Testing에서는 `test` 접두사가 필요 없다 (`@Test func`이므로)
  - WHY: @Test 매크로가 테스트임을 명시하므로 접두사는 중복이다.

## 테스트 격리 규칙

- 각 테스트는 독립적으로 실행 가능해야 한다
  - WHY: 테스트 실행 순서에 의존하면 하나가 실패할 때 연쇄 실패가 발생한다.
- Swift Testing에서는 struct + init으로 setUp/tearDown을 대체한다
  - WHY: struct는 각 테스트마다 새 인스턴스가 생성되어 상태 격리가 자동으로 보장된다.
- UI 상태를 다루는 테스트에는 `@MainActor`를 명시한다
  - WHY: SwiftUI의 @State/@Published는 메인 스레드에서만 안전하게 접근할 수 있다.

## XCTest → Swift Testing 빠른 참조표

| XCTest | Swift Testing |
|---|---|
| `class ... : XCTestCase` | `@Suite struct ...` |
| `func testFoo()` | `@Test func foo()` |
| `override func setUp()` | `init()` |
| `override func tearDown()` | `deinit` (class 사용 시) |
| `XCTAssertEqual(a, b)` | `#expect(a == b)` |
| `XCTAssertTrue(x)` | `#expect(x)` |
| `XCTAssertNil(x)` | `#expect(x == nil)` |
| `XCTAssertThrowsError` | `#expect(throws: ErrorType.self)` |
| `XCTFail("msg")` | `Issue.record("msg")` |
| 별도 메서드 복사 | `@Test(arguments: [...])` |
| 없음 | `@Test(.tags(.networking))` |
| `XCTestExpectation` | `confirmation` |

## 리소스

- [Swift Testing — Apple Developer Documentation](https://developer.apple.com/documentation/testing)
- [WWDC24: Meet Swift Testing](https://developer.apple.com/videos/play/wwdc2024/10179/)
- [WWDC24: Go further with Swift Testing](https://developer.apple.com/videos/play/wwdc2024/10195/)
- [WWDC21: Use async/await with URLSession](https://developer.apple.com/videos/play/wwdc2021/10095/)
- [XCTest — Apple Developer Documentation](https://developer.apple.com/documentation/xctest)
