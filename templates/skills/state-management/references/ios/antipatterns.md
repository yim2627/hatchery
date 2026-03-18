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

## 목차

- C1. 여러 Source of Truth
- C2. MainActor 밖에서 UI 상태 변경
- C3. @State를 부모와 자식이 동시에 소유
- C4. 순환 참조
- W1. Bool 플래그 조합
- W2. @Published 과다
- W3. @EnvironmentObject 남용
- W4. 전역 싱글턴으로 상태 공유
- 변환 패턴: ObservableObject → @Observable, @StateObject → @State, @EnvironmentObject → @Environment

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
