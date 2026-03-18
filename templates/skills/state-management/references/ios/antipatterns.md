# iOS 상태 관리 안티패턴

심각도별로 정리한 안티패턴과 수정 방법.

## 체크리스트

| ID | 안티패턴 | 심각도 | 탐지 규칙 | 수정 방법 |
|---|---|---|---|---|
| C1 | 여러 Source of Truth | CRITICAL | 같은 데이터가 여러 ViewModel에 `@Published`로 존재 | 하나의 source of truth + computed 파생 |
| C2 | MainActor 밖에서 UI 상태 변경 | CRITICAL | `Task { }` 안에서 `@Published` 프로퍼티 직접 변경 | `@MainActor` 격리 |
| C3 | @State 소유권 충돌 | CRITICAL | 부모와 자식 모두 같은 데이터에 `@State` 사용 | 부모 @State + 자식 @Binding |
| C4 | 순환 참조 | CRITICAL | 콜백 클로저에서 `[self]` 강한 캡처 | async/await로 콜백 제거 또는 `[weak self]` |
| W1 | Bool 플래그 조합 | WARNING | `isLoading`, `hasError`, `data` 등 Bool 3개 이상 조합 | 상태 enum 사용 |
| W2 | @Published 과다 | WARNING | 파생 가능한 프로퍼티에 `@Published` 사용 | computed property로 교체 |
| W3 | @EnvironmentObject 남용 | WARNING | View에 `@EnvironmentObject` 3개 이상 | 필요한 데이터만 props로 전달 |
| W4 | 전역 싱글턴 상태 | WARNING | `static let shared` 패턴으로 상태 공유 | 생성자 주입 + @Environment |
| O1 | @Observable에 @Published 사용 | WARNING | `@Observable` class 안에 `@Published` 선언 | `@Published` 제거 (자동 추적) |
| O2 | @Observable 객체를 let으로 수신 | WARNING | `@State` 없이 `let vm = ViewModel()`으로 소유 | `@State`로 소유권 확보 |
| O3 | @ObservationIgnored 누락 | WARNING | 추적 불필요한 프로퍼티에 `@ObservationIgnored` 없음 | `@ObservationIgnored` 추가 |

## 목차

- C1. 여러 Source of Truth
- C2. MainActor 밖에서 UI 상태 변경
- C3. @State를 부모와 자식이 동시에 소유
- C4. 순환 참조
- W1. Bool 플래그 조합
- W2. @Published 과다
- W3. @EnvironmentObject 남용
- W4. 전역 싱글턴으로 상태 공유
- O1. @Observable에 @Published 사용
- O2. @Observable 객체를 let으로 수신
- O3. @ObservationIgnored 누락
- 변환 패턴: ObservableObject → @Observable, @StateObject → @State, @EnvironmentObject → @Environment
- 결정 다이어그램: 상태 버그 디버깅 플로우

---

## CRITICAL — 데이터 불일치·크래시

### C1. 여러 Source of Truth — 동기화 불가능

```swift
// ❌ 같은 데이터가 두 곳에 저장됨
class ProfileViewModel: ObservableObject {
    @Published var userName: String = ""
}

class SettingsViewModel: ObservableObject {
    @Published var displayName: String = "" // userName과 같은 값인데 별도 관리
}
// 한쪽을 바꾸면 다른 쪽은 모름

// ✅ 하나의 source of truth + 파생
@Observable
final class UserStore {
    var currentUser: User?

    var displayName: String {
        currentUser?.name ?? "게스트"
    }
}
```

**WHY:** 같은 데이터를 여러 곳에 저장하면 한쪽 변경이 다른 쪽에 전파되지 않아 UI가 불일치한다. 단일 source of truth에서 파생하면 항상 동기화된다.

### C2. MainActor 밖에서 UI 상태 변경

```swift
// ❌ 백그라운드에서 @Published 변경 → 런타임 경고 + 업데이트 누락
class ViewModel: ObservableObject {
    @Published var items: [Item] = []

    func load() {
        Task {
            let result = try await api.fetchItems()
            self.items = result // MainActor가 아닌 컨텍스트
        }
    }
}

// ✅ @MainActor 격리
@Observable
final class ViewModel {
    var items: [Item] = []

    @MainActor
    func load() async {
        let result = try? await api.fetchItems()
        self.items = result ?? []
    }
}
```

**WHY:** SwiftUI는 메인 스레드에서 렌더링한다. 백그라운드에서 UI 상태를 변경하면 업데이트가 누락되거나 런타임 경고가 발생한다.

### C3. @State를 부모와 자식이 동시에 소유

```swift
// ❌ 부모와 자식 모두 같은 데이터의 @State를 가짐
struct ParentView: View {
    @State private var text = ""

    var body: some View {
        ChildView(text: text) // 값 복사 → 동기화 안 됨
    }
}

struct ChildView: View {
    @State var text: String // 별도 @State → 부모 변경이 반영 안 됨
}

// ✅ 부모가 소유, 자식은 @Binding
struct ParentView: View {
    @State private var text = ""

    var body: some View {
        ChildView(text: $text)
    }
}

struct ChildView: View {
    @Binding var text: String
}
```

**WHY:** @State는 View가 소유하는 독립적인 저장소다. 부모와 자식이 각각 @State를 가지면 두 개의 별도 복사본이 되어 변경이 서로에게 전파되지 않는다.

### C4. 순환 참조 — ViewModel과 View가 서로 강하게 참조

```swift
// ❌ 순환 참조 → 메모리 릭
class ViewModel: ObservableObject {
    var onUpdate: (() -> Void)?

    func load() {
        api.fetch { [self] data in // self를 강하게 캡처
            self.data = data
            self.onUpdate?()
        }
    }
}

// ✅ weak 캡처 또는 async/await로 콜백 제거
class ViewModel: ObservableObject {
    @Published var data: Data?

    func load() async {
        self.data = try? await api.fetch()
        // 콜백 없음 → 순환 참조 불가
    }
}
```

**WHY:** 클로저가 self를 강하게 캡처하고, self가 클로저를 소유하면 둘 다 해제되지 않는다. async/await는 구조적 동시성으로 이 문제를 근본적으로 제거한다.

---

## WARNING — 성능·유지보수 문제

### W1. Bool 플래그 조합 — 불가능한 상태 허용

```swift
// ❌ isLoading && hasError가 동시에 true일 수 있음
@State private var isLoading = false
@State private var hasError = false
@State private var data: [Item]?
// 3개 Bool → 8가지 조합 중 유효한 건 4가지뿐

// ✅ 상태 enum으로 불가능한 조합 제거
enum ViewState<T> {
    case idle
    case loading
    case loaded(T)
    case empty
    case error(Error)
}

@State private var state: ViewState<[Item]> = .idle
```

**WHY:** Bool 플래그를 여러 개 조합하면 논리적으로 불가능한 상태(로딩 중이면서 에러)를 타입 시스템이 막지 못한다. enum은 컴파일러가 모든 케이스를 강제하므로 불가능한 상태가 원천 차단된다.

### W2. @Published 과다 — 불필요한 리렌더링

```swift
// ❌ 모든 프로퍼티가 @Published → 하나만 바뀌어도 전체 리렌더
class ViewModel: ObservableObject {
    @Published var name = ""
    @Published var email = ""
    @Published var isValid = false    // name, email에서 파생 가능
    @Published var greeting = ""      // name에서 파생 가능
}

// ✅ 파생 가능한 것은 computed로
@Observable
final class ViewModel {
    var name = ""
    var email = ""

    var isValid: Bool { !name.isEmpty && email.contains("@") }
    var greeting: String { "안녕하세요, \(name)" }
}
```

**WHY:** ObservableObject는 objectWillChange 하나로 전체를 알린다. @Published가 많을수록 하나의 변경이 전체 리렌더를 유발한다. computed property는 저장하지 않으므로 변경 알림 자체가 없다.

### W3. @EnvironmentObject 남용 — 암묵적 의존성

```swift
// ❌ 어디서든 꺼내 쓸 수 있어서 의존성 추적 불가
struct DeepNestedView: View {
    @EnvironmentObject var userStore: UserStore
    @EnvironmentObject var cartStore: CartStore
    @EnvironmentObject var themeStore: ThemeStore
    // 이 View가 3개 store에 의존하는지 선언부를 봐야 앎
}

// ✅ 필요한 데이터만 props로 전달
struct DeepNestedView: View {
    let userName: String
    let cartItemCount: Int
    let accentColor: Color
}
```

**WHY:** @EnvironmentObject는 런타임에 주입되므로 누락 시 크래시한다. 또한 View의 의존성이 선언부에 드러나지 않아 재사용성과 테스트가 어려워진다.

### W4. 전역 싱글턴으로 상태 공유

```swift
// ❌ 테스트·프리뷰에서 상태 교체 불가
class AppState {
    static let shared = AppState()
    var isLoggedIn = false
}

// ✅ 생성자 주입 + @Environment
@Observable
final class AppState {
    var isLoggedIn = false
}

// App 진입점에서 주입
@main
struct MyApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(appState)
        }
    }
}
```

**WHY:** 싱글턴은 테스트에서 상태를 초기화하거나 교체할 수 없다. @Environment로 주입하면 프리뷰와 테스트에서 자유롭게 목 객체를 넣을 수 있다.

---

## @Observable 전용 안티패턴

### O1. @Observable에 @Published 사용 — 이중 래핑

```swift
// ❌ 컴파일은 되지만 이중 추적으로 예측 불가 동작
@Observable
final class ViewModel {
    @Published var name: String = ""  // @Observable + @Published 이중 래핑
}

// ✅ @Published 제거 — @Observable이 자동 추적
@Observable
final class ViewModel {
    var name: String = ""
}
```

**WHY:** @Observable은 모든 저장 프로퍼티를 자동 추적한다. @Published를 추가하면 ObservableObject의 objectWillChange와 Observation 프레임워크가 동시에 작동하여 예측 불가능한 이중 알림이 발생한다.

### O2. @State 없이 @Observable 객체를 let으로 수신 — 소유권 누락

```swift
// ❌ View가 리렌더될 때마다 새 인스턴스 생성
struct ParentView: View {
    var body: some View {
        ChildView(vm: ViewModel()) // 매 렌더마다 새 ViewModel
    }
}

struct ChildView: View {
    let vm: ViewModel  // 소유권 없음 → 부모 리렌더 시 상태 소실
}

// ✅ 소유하는 쪽에서 @State로 선언
struct ParentView: View {
    @State private var vm = ViewModel()

    var body: some View {
        ChildView(vm: vm) // 안정적인 인스턴스 전달
    }
}

struct ChildView: View {
    var vm: ViewModel  // 주입받아 사용 (소유권은 부모)
}
```

**WHY:** @State 없이 생성한 @Observable 객체는 View의 body가 재평가될 때마다 새로 생성된다. 사용자 입력이나 비동기 로딩 중인 상태가 갑자기 초기화되는 버그로 이어진다.

### O3. @ObservationIgnored 누락 — 불필요한 리렌더

```swift
// ❌ 내부 캐시가 바뀔 때마다 View가 리렌더됨
@Observable
final class ImageLoader {
    var currentImage: UIImage?
    var cache: [URL: UIImage] = [:]        // View에서 읽지 않지만 추적됨
    var requestCount: Int = 0               // 디버깅용인데 추적됨
}

// ✅ 추적 불필요한 프로퍼티 제외
@Observable
final class ImageLoader {
    var currentImage: UIImage?
    @ObservationIgnored var cache: [URL: UIImage] = [:]
    @ObservationIgnored var requestCount: Int = 0
}
```

**WHY:** @Observable은 모든 저장 프로퍼티를 기본 추적한다. View에서 읽지 않는 프로퍼티라도 변경 시 불필요한 리렌더가 발생할 수 있다. @ObservationIgnored로 명시적으로 제외해야 한다.

---

## 결정 다이어그램: 상태 버그 디버깅 플로우

```
"UI가 업데이트되지 않는다"
│
├─→ @Observable 사용 중?
│     ├─→ YES: 해당 프로퍼티를 View의 body에서 직접 읽고 있는가?
│     │     ├─→ NO → body에서 직접 접근해야 추적됨. 클로저/함수 안에서만 읽으면 추적 안 됨
│     │     └─→ YES → @ObservationIgnored가 붙어 있지는 않은가?
│     │           ├─→ YES → @ObservationIgnored 제거
│     │           └─→ NO → @MainActor에서 변경하고 있는가? (C2 확인)
│     │
│     └─→ NO (ObservableObject): @Published가 붙어 있는가?
│           ├─→ NO → @Published 추가
│           └─→ YES → objectWillChange가 메인 스레드에서 발행되는가?
│
├─→ "UI가 너무 자주 업데이트된다"
│     ├─→ @Observable: @ObservationIgnored 누락 확인 (O3)
│     ├─→ ObservableObject: @Published 과다 확인 (W2)
│     └─→ 공통: 파생 상태를 stored property로 저장하고 있지 않은가?
│
├─→ "상태가 갑자기 초기화된다"
│     ├─→ @Observable 객체를 @State 없이 생성하고 있지 않은가? (O2)
│     ├─→ 부모·자식이 각각 @State를 가지고 있지 않은가? (C3)
│     └─→ NavigationStack에서 View가 재생성되는 경우 → 상위에서 @State로 소유
│
└─→ "메모리가 계속 증가한다"
      ├─→ 클로저에서 [self] 강한 캡처 확인 (C4)
      └─→ @State로 만든 @Observable 객체가 해제되지 않는 경우 → View 계층 확인
```

---

## 변환 패턴

### ObservableObject → @Observable (iOS 17+)

```swift
// Before
class ViewModel: ObservableObject {
    @Published var name: String = ""
    @Published var items: [Item] = []
    @Published var isLoading: Bool = false
}

struct MyView: View {
    @StateObject private var vm = ViewModel()

    var body: some View {
        List(vm.items) { item in
            Text(item.title)
        }
    }
}

// After
@Observable
final class ViewModel {
    var name: String = ""
    var items: [Item] = []
    var isLoading: Bool = false
}

struct MyView: View {
    @State private var vm = ViewModel()

    var body: some View {
        List(vm.items) { item in
            Text(item.title)
        }
    }
}
```

핵심 차이:

| | ObservableObject | @Observable |
|---|---|---|
| 프로퍼티 래퍼 | `@Published` 필수 | 불필요 (자동 추적) |
| 관찰 범위 | 객체 전체 | 읽은 프로퍼티만 |
| View 소유권 | `@StateObject` | `@State` |
| 전달 | `@ObservedObject` | 일반 프로퍼티 |
| 환경 | `@EnvironmentObject` | `@Environment` |
| 바인딩 | `$vm.property` | `@Bindable var vm = vm` |

### @StateObject → @State

```swift
// Before
struct ParentView: View {
    @StateObject private var vm = ViewModel()

    var body: some View {
        ChildView(vm: vm)
    }
}

struct ChildView: View {
    @ObservedObject var vm: ViewModel
}

// After
struct ParentView: View {
    @State private var vm = ViewModel()

    var body: some View {
        ChildView(vm: vm)
    }
}

struct ChildView: View {
    var vm: ViewModel  // @ObservedObject 불필요
}
```

### @EnvironmentObject → @Environment

```swift
// Before
@main
struct MyApp: App {
    @StateObject private var store = UserStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
        }
    }
}

struct ContentView: View {
    @EnvironmentObject var store: UserStore
}

// After
@main
struct MyApp: App {
    @State private var store = UserStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(store)
        }
    }
}

struct ContentView: View {
    @Environment(UserStore.self) private var store
}
```

---

## 리소스

- [Managing model data in your app — Apple](https://developer.apple.com/documentation/swiftui/managing-model-data-in-your-app)
- [Observation — Apple Developer Documentation](https://developer.apple.com/documentation/observation)
- [WWDC23: Discover Observation in SwiftUI](https://developer.apple.com/videos/play/wwdc2023/10149/)
- [WWDC20: Data Essentials in SwiftUI](https://developer.apple.com/videos/play/wwdc2020/10040/)
- [WWDC19: Data Flow Through SwiftUI](https://developer.apple.com/videos/play/wwdc2019/226/)
