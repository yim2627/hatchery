# UI 규칙 — iOS (SwiftUI)

## SwiftUI View 체크리스트

- [ ] body에 분기/계산 로직이 없고 선언적으로만 구성
- [ ] 서브뷰 추출은 재사용 또는 읽기 어려울 때만
- [ ] .task { }를 사용하고 .onAppear에서 Task를 직접 생성하지 않음
- [ ] 상태 변경은 모두 @MainActor 격리 안에서 발생
- [ ] NavigationStack + navigationDestination 패턴 사용 (iOS 16+)
- [ ] 대량 리스트에 LazyVStack/LazyHStack 사용
- [ ] Preview가 빌드되고 의미 있는 데이터를 표시
- [ ] iOS 17+이면 ObservableObject보다 @Observable을 우선 검토

## 결정 다이어그램: Property Wrapper 선택

```
"이 데이터를 누가 소유하는가?"
│
├─ "이 View가 소유"
│   └─→ @State
│       └─ "자식에게 읽기/쓰기 전달?"
│           └─→ @Binding
│
├─ "부모가 소유"
│   ├─ "읽기만?" → let (일반 프로퍼티)
│   └─ "읽기+쓰기?" → @Binding
│
└─ "외부 객체가 소유 (@Observable)"
    ├─ "이 View가 생성?" → @State
    ├─ "주입 받음?" → 일반 프로퍼티 (자동 추적)
    ├─ "환경에서?" → @Environment
    └─ "바인딩 필요?" → @Bindable
```

- WHY @State: View가 소유하는 값 타입 상태. SwiftUI가 수명을 관리한다.
- WHY @Binding: 부모의 @State에 대한 읽기/쓰기 참조. 단일 진실 공급원을 유지한다.
- WHY @Environment: 앱 전역에서 공유하는 값(colorScheme, dismiss 등)에 적합하다.
- WHY @Bindable: @Observable 객체의 프로퍼티에 $ 바인딩을 생성할 때 사용한다.

## 결정 다이어그램: 데이터 로딩 전략

```
"View에서 데이터를 불러와야 한다"
│
├─ "View 생명주기에 연결?"
│   └─→ .task { } 수정자
│       WHY: View가 사라지면 자동 취소. onAppear + Task 수동 관리보다 안전
│
├─ "조건부/반복 로딩?"
│   └─→ .task(id:) { }
│       WHY: id가 변경될 때만 재실행. 불필요한 중복 호출 방지
│
└─ "한번만 로드?"
    └─→ .task { guard !hasLoaded else { return }; await load() }
```

## View 성능 규칙

- body는 순수 함수처럼 동작해야 한다 — 사이드 이펙트 금지
  - WHY: SwiftUI는 body를 예측 불가능한 시점에 여러 번 호출할 수 있다
- @Observable 사용 시 body에서 읽은 프로퍼티만 추적된다
  - WHY: 읽지 않은 프로퍼티가 바뀌어도 리렌더 되지 않아서 효율적
- VStack보다 LazyVStack (항목 50개 이상일 때)
  - WHY: VStack은 모든 자식을 즉시 생성. LazyVStack은 화면에 보이는 것만 생성
- GeometryReader는 최소 범위에서만 사용한다
  - WHY: GeometryReader는 사용 가능한 공간을 모두 차지하고 레이아웃 계산을 복잡하게 만든다

## 네비게이션 규칙

- NavigationStack + value 기반 navigationDestination 사용
  - WHY: NavigationLink(destination:)은 리스트에서 모든 destination을 즉시 초기화한다
- NavigationPath로 프로그래매틱 네비게이션 관리
  - WHY: 딥링크, 조건부 네비게이션, 스택 초기화가 간단해진다
- sheet/fullScreenCover에 item: 바인딩 사용 (Bool 대신)
  - WHY: item이 non-nil일 때만 표시하므로 상태 일관성이 보장된다

## 상태 관리 규칙

- 상태 조합은 enum으로 표현한다 (Bool 플래그 조합 금지)
  - WHY: idle/loading/loaded/error 상태가 동시에 존재하는 불가능한 조합을 방지한다
- 상태 업데이트는 @MainActor 격리를 준수한다
  - WHY: UI 업데이트는 반드시 메인 스레드에서 실행되어야 한다
- @State, @Binding, @Environment, @Bindable을 의도적으로 구분해서 사용한다
  - WHY: 잘못된 Property Wrapper는 불필요한 리렌더링이나 메모리 누수를 유발한다
