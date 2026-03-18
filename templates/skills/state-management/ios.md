# 상태 관리 규칙 — iOS

## @Observable 시대의 상태 관리 체크리스트

- [ ] iOS 17+ 프로젝트면 ObservableObject 대신 @Observable 사용
- [ ] @Published 대신 일반 프로퍼티 (자동 추적)
- [ ] @StateObject 대신 @State로 소유
- [ ] @ObservedObject 대신 일반 프로퍼티로 전달
- [ ] @EnvironmentObject 대신 @Environment
- [ ] 파생 가능한 상태는 computed property로
- [ ] 상호 배타적 UI 상태는 enum으로 표현
- [ ] UI를 구동하는 모든 상태 변경에 `@MainActor` 격리를 준수
- [ ] 영속 상태가 필요하면 `@AppStorage` / `@SceneStorage` / SwiftData `@Query` 검토

## 결정 다이어그램: 상태 소유권

```
"이 상태를 누가 만들고 유지하는가?"
│
├─→ "View가 직접 만듦"
│     └─→ @State
│          WHY: View의 생명주기에 바인딩됨. View가 재생성되어도 값이 유지된다.
│
├─→ "부모 View가 전달"
│     ├─→ "읽기만?" → let 프로퍼티
│     └─→ "수정도?" → @Binding
│          WHY: 부모의 @State와 양방향 연결. 자식이 수정하면 부모도 갱신된다.
│
├─→ "@Observable 객체"
│     ├─→ "View가 소유?" → @State private var vm = ViewModel()
│     │    WHY: @State가 인스턴스를 View 생명주기에 고정. 리렌더에서 재생성 방지.
│     │
│     ├─→ "부모에서 주입?" → var vm: ViewModel (일반 프로퍼티)
│     │    WHY: @Observable이면 별도 래퍼 없이 프로퍼티 접근만으로 추적됨.
│     │
│     └─→ "환경에서?" → @Environment(ViewModel.self)
│          WHY: 깊은 계층에서 prop drilling 없이 접근 가능.
│
├─→ "앱 전체 공유?"
│     └─→ @Environment + App 레벨 .environment()
│          WHY: 앱 생명주기와 동일. 어디서든 일관된 인스턴스에 접근.
│
└─→ "영속 필요?"
      ├─→ 단순 키-값 → @AppStorage (UserDefaults 래퍼)
      └─→ 구조화된 모델 → SwiftData @Query
           WHY: 앱 재시작 후에도 상태가 유지되어야 하면 메모리 상태로는 부족하다.
```

## 결정 다이어그램: 상태 표현 방식

```
"이 UI에 표현해야 할 상태의 종류가 몇 개인가?"
│
├─→ "2개 (on/off)"
│     └─→ Bool
│
├─→ "3개 이상 (loading/loaded/error/empty 등)"
│     └─→ enum
│          WHY: Bool 조합은 불가능한 상태를 허용한다 (isLoading=true && error!=nil).
│
├─→ "파생 가능 (다른 상태에서 계산)?"
│     └─→ computed property
│          WHY: 별도 저장하면 동기화 실패 위험. 원본이 바뀌면 자동 갱신.
│
└─→ "컬렉션 내 개별 항목 선택?"
      └─→ Set<ID> 또는 Optional<ID>
           WHY: 항목 자체를 복사하면 원본과 동기화가 깨진다.
```

## @Observable 핵심 규칙

- @Observable class는 `final`로 선언한다
  - WHY: 상속하면 observation 추적이 깨질 수 있다
- `@ObservationIgnored`로 추적 불필요한 프로퍼티를 제외한다
  - WHY: 캐시, 내부 카운터 등이 바뀔 때마다 불필요한 리렌더 발생
- View에서 `@Bindable`은 body 안에서 선언한다
  - WHY: @Bindable은 바인딩($) 접근을 위한 래퍼. body 밖에서 선언하면 의미 없음
- `@Observable` 클래스에 `@MainActor`를 적용한다
  - WHY: UI 상태 변경이 메인 스레드에서 일어남을 컴파일러가 보장

## 레거시 지원 (iOS 16 이하)

iOS 17 미만을 지원해야 하는 경우 기존 규칙을 따른다:

- View 상태에는 `ObservableObject`를 사용한다
- `@Published` / `@State` 프로퍼티는 최소화하고, 파생 가능한 것은 computed로 처리한다
- source of truth에서 계산 가능한 파생 상태를 별도 저장하지 않는다
- 상호 배타적인 UI 상태에는 enum을 사용한다 (loading/success/error)
- 영속 상태가 필요하면 `@AppStorage` / `@SceneStorage`를 검토한다
