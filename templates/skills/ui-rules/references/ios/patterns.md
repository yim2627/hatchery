# SwiftUI 패턴과 안티패턴

## 목차

- SwiftUI View 품질 체크리스트
- Property Wrapper 결정 다이어그램
- View 생명주기 다이어그램
- @Observable 마이그레이션 (iOS 17+)
- 안티패턴 (WHY 포함)
- 성능 패턴
- 네비게이션 패턴
- 새로운 패턴: .task(id:), @Bindable, View 분해, sheet item 기반, GeometryReader 최소화
- 리소스

---

## SwiftUI View 품질 체크리스트

| 항목 | 확인 | WHY |
|------|:----:|-----|
| body에 분기/계산 로직 없음 | [ ] | body는 여러 번 호출될 수 있어 사이드 이펙트가 중복 실행된다 |
| 서브뷰 추출은 재사용/가독성 목적일 때만 | [ ] | 과도한 추출은 데이터 흐름을 추적하기 어렵게 만든다 |
| .task { } 사용 (.onAppear + Task 금지) | [ ] | .task는 View 소멸 시 자동 취소되어 메모리 누수를 방지한다 |
| 상태 변경은 @MainActor 안에서 | [ ] | UI 업데이트는 메인 스레드에서만 안전하다 |
| NavigationStack + navigationDestination | [ ] | NavigationLink(destination:)은 모든 목적지를 즉시 초기화한다 |
| 대량 리스트에 LazyVStack/LazyHStack | [ ] | 비Lazy 컨테이너는 모든 자식을 한번에 생성한다 |
| Preview가 빌드되고 의미 있는 데이터 표시 | [ ] | 빈 Preview는 레이아웃 문제를 숨긴다 |
| 상태 조합을 enum으로 표현 | [ ] | Bool 플래그 조합은 불가능한 상태를 허용한다 |
| @Observable 프로퍼티 추적 범위 확인 | [ ] | body에서 읽지 않은 프로퍼티 변경은 리렌더를 유발하지 않는다 |
| GeometryReader 사용 범위 최소화 | [ ] | 상위에 배치하면 레이아웃 전체에 영향을 준다 |

---

## Property Wrapper 결정 다이어그램 (상세)

```
"이 데이터를 누가 소유하는가?"
│
├─ "이 View가 소유" (진실 공급원 = 이 View)
│   │
│   ├─ 값 타입 (String, Int, Bool, struct)
│   │   └─→ @State
│   │       WHY: SwiftUI가 값의 수명을 View identity에 연결한다.
│   │            View가 재생성되어도 값이 보존된다.
│   │
│   ├─ @Observable 클래스 (이 View가 생성)
│   │   └─→ @State
│   │       WHY: @StateObject 대신 @State를 사용한다 (iOS 17+).
│   │            SwiftUI가 인스턴스 수명을 관리한다.
│   │
│   └─ "자식에게 읽기/쓰기 전달?"
│       └─→ @Binding (자식 View에서 선언)
│           WHY: 부모의 @State에 대한 양방향 참조.
│                단일 진실 공급원을 유지하면서 자식이 수정 가능.
│
├─ "부모/외부가 소유" (진실 공급원 = 다른 곳)
│   │
│   ├─ "읽기만 필요?"
│   │   └─→ let (일반 프로퍼티)
│   │       WHY: 가장 단순한 형태. 불필요한 래퍼 없이 값을 전달.
│   │
│   ├─ "읽기+쓰기 필요?"
│   │   └─→ @Binding
│   │       WHY: 부모의 상태를 직접 수정할 수 있는 참조.
│   │
│   └─ "@Observable 객체를 주입받음?"
│       ├─ "바인딩 불필요" → 일반 프로퍼티 (var viewModel: MyModel)
│       │   WHY: @Observable은 프로퍼티 접근만으로 자동 추적된다.
│       │        별도의 래퍼가 필요 없다.
│       │
│       └─ "바인딩 필요 ($property)" → @Bindable
│           WHY: @Observable 객체의 프로퍼티에 $ 접두사로
│                바인딩을 생성할 수 있게 해준다.
│
└─ "환경/시스템이 소유"
    │
    ├─ SwiftUI 시스템 값 (colorScheme, dismiss, locale 등)
    │   └─→ @Environment(\.keyPath)
    │       WHY: 앱 전역에서 일관된 값을 제공한다.
    │            View 계층 어디서든 접근 가능.
    │
    └─ 커스텀 @Observable 객체를 환경에 주입
        └─→ @Environment(ModelType.self)
            WHY: iOS 17+에서 @EnvironmentObject를 대체한다.
                 타입 기반으로 더 안전하다.
```

---

## View 생명주기 다이어그램

```
View 생성 (init)
    │
    ▼
body 평가 (렌더링)
    │
    ▼
View가 화면에 나타남
    ├─ .onAppear 실행
    ├─ .task { } 실행 (비동기 작업 시작)
    └─ .task(id: value) { } 실행 (id 값에 따라)
    │
    ▼
View 업데이트 (상태 변경 시)
    ├─ body 재평가
    ├─ .onChange(of:) 실행
    └─ .task(id:) → id 변경 시: 이전 task 취소 → 새 task 시작
    │
    ▼
View가 화면에서 사라짐
    ├─ .task { } 자동 취소 ← WHY .task가 .onAppear + Task보다 안전한 이유
    ├─ .onDisappear 실행
    └─ 정리 작업 수행
```

핵심 순서:
1. `init` → `body` → `.onAppear` → `.task { }`
2. 상태 변경 → `body` 재평가 → `.onChange(of:)`
3. `.onDisappear` + `.task` 자동 취소

- WHY 이 순서가 중요한가: .task는 .onAppear 이후에 실행되며, View가 사라지면 자동으로 Task가 취소된다. .onAppear에서 수동으로 Task를 생성하면 취소를 직접 관리해야 하므로 메모리 누수 위험이 있다.

---

## @Observable 마이그레이션 (iOS 17+)

```swift
// Before (ObservableObject)
class ViewModel: ObservableObject {
    @Published var name: String = ""
    @Published var isLoading: Bool = false
}

struct MyView: View {
    @StateObject private var vm = ViewModel()
    var body: some View {
        TextField("이름", text: $vm.name)
    }
}

// After (@Observable)
@Observable
final class ViewModel {
    var name: String = ""       // @Published 불필요
    var isLoading: Bool = false
}

struct MyView: View {
    @State private var vm = ViewModel()  // @StateObject → @State
    var body: some View {
        @Bindable var vm = vm            // 바인딩 필요 시
        TextField("이름", text: $vm.name)
    }
}
```

핵심 차이:

| | ObservableObject | @Observable |
|---|---|---|
| 관찰 단위 | 객체 전체 | 프로퍼티별 |
| 리렌더링 | @Published 변경 시 전체 | 읽은 프로퍼티 변경 시만 |
| 바인딩 | $viewModel.property | @Bindable 필요 |
| 소유권 | @StateObject | @State |
| 환경 주입 | @EnvironmentObject | @Environment(Type.self) |

- WHY @Observable을 사용하는가: ObservableObject는 @Published 프로퍼티 하나만 바뀌어도 해당 객체를 관찰하는 모든 View가 리렌더된다. @Observable은 body에서 실제로 읽은 프로퍼티만 추적하므로 불필요한 리렌더링이 크게 줄어든다.

---

## 안티패턴

### 1. body에서 무거운 작업

```swift
// ❌ body 호출마다 필터링 실행
var body: some View {
    List(items.filter { $0.isActive }.sorted(by: { $0.date > $1.date })) { item in
        ItemRow(item: item)
    }
}

// ✅ computed property나 ViewModel에서 처리
var activeItems: [Item] {
    items.filter { $0.isActive }.sorted(by: { $0.date > $1.date })
}

var body: some View {
    List(activeItems) { item in
        ItemRow(item: item)
    }
}
```

- WHY: SwiftUI는 상태가 변경될 때마다 body를 재평가한다. body 안에 O(n log n) 정렬이나 필터링이 있으면 매 렌더링마다 실행되어 스크롤 성능이 저하된다. computed property로 분리하면 SwiftUI가 의존성을 더 정확히 추적할 수 있다.

### 2. .onAppear에서 반복 로드

```swift
// ❌ 탭 전환할 때마다 다시 로드
var body: some View {
    List(items) { item in
        ItemRow(item: item)
    }
    .onAppear { Task { await loadItems() } }
}

// ✅ .task 사용 — 자동 취소 보장
var body: some View {
    List(items) { item in
        ItemRow(item: item)
    }
    .task {
        if items.isEmpty { await loadItems() }
    }
}
```

- WHY: .onAppear에서 Task를 직접 생성하면 View가 사라져도 Task가 계속 실행된다. 빠른 탭 전환 시 여러 Task가 동시에 실행되어 경쟁 조건이 발생할 수 있다. .task는 View가 사라지면 자동으로 Task를 취소한다.

### 3. 상태 enum 없이 Bool 플래그 조합

```swift
// ❌ 상태 조합이 폭발적으로 늘어남
@State private var isLoading = false
@State private var error: Error?
@State private var data: [Item]?
// isLoading == true && data != nil && error != nil → ???

// ✅ 상태 enum
enum ViewState {
    case idle
    case loading
    case loaded([Item])
    case empty
    case error(Error)
}

@State private var state: ViewState = .idle
```

- WHY: Bool 3개는 2^3 = 8가지 조합을 만들지만, 실제 유효한 상태는 4~5가지뿐이다. enum은 불가능한 상태 조합을 컴파일 타임에 방지하고, switch 문에서 exhaustive 체크를 강제한다.

### 4. NavigationLink에서 destination 즉시 초기화

```swift
// ❌ 리스트 렌더링 시 모든 destination이 즉시 생성됨
List(items) { item in
    NavigationLink(destination: DetailView(item: item)) {
        ItemRow(item: item)
    }
}

// ✅ NavigationStack + navigationDestination (iOS 16+)
NavigationStack {
    List(items) { item in
        NavigationLink(value: item) {
            ItemRow(item: item)
        }
    }
    .navigationDestination(for: Item.self) { item in
        DetailView(item: item)
    }
}
```

- WHY: NavigationLink(destination:)은 클로저가 아닌 즉시 평가(eager evaluation)된다. 리스트에 100개 항목이 있으면 100개의 DetailView가 한꺼번에 초기화된다. navigationDestination은 실제로 네비게이션할 때만 destination을 생성한다.

### 5. Concurrency 안티패턴: @MainActor 미준수

```swift
// ❌ 백그라운드에서 @State 직접 수정
func loadData() async {
    let result = await api.fetch()
    self.items = result  // @State를 백그라운드 스레드에서 수정 가능
}

// ✅ @MainActor로 격리
@MainActor
func loadData() async {
    let result = await api.fetch()
    self.items = result  // 메인 스레드 보장
}
```

- WHY: Swift 6의 strict concurrency에서는 @State를 메인 액터 외부에서 수정하면 컴파일 에러가 발생한다. 지금부터 @MainActor를 습관화해야 마이그레이션 비용이 줄어든다.

---

## 성능 패턴

### Lazy 로딩

```swift
// 대량 리스트에서는 LazyVStack 사용
ScrollView {
    LazyVStack {  // VStack이 아닌 LazyVStack
        ForEach(items) { item in
            ItemRow(item: item)
        }
    }
}
```

- WHY: VStack은 ForEach의 모든 자식 View를 즉시 생성한다. 1000개 항목이면 1000개의 View가 메모리에 올라간다. LazyVStack은 화면에 보이는 항목만 생성하고 스크롤하면서 재활용한다.

### Equatable View

```swift
// 불필요한 리렌더링 방지
struct ExpensiveRow: View, Equatable {
    let item: Item

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.item.id == rhs.item.id && lhs.item.updatedAt == rhs.item.updatedAt
    }

    var body: some View {
        // 복잡한 렌더링
    }
}
```

- WHY: SwiftUI는 기본적으로 부모가 리렌더될 때 모든 자식의 body를 재평가한다. Equatable을 구현하면 SwiftUI가 "이전과 같은 입력"인지 비교하여 불필요한 body 재평가를 건너뛸 수 있다.

---

## 네비게이션 패턴

### NavigationPath로 프로그래매틱 네비게이션

```swift
@Observable
final class Router {
    var path = NavigationPath()

    func goToDetail(_ item: Item) {
        path.append(item)
    }

    func goToRoot() {
        path.removeLast(path.count)
    }
}

struct ContentView: View {
    @State private var router = Router()

    var body: some View {
        NavigationStack(path: $router.path) {
            ItemListView()
                .navigationDestination(for: Item.self) { item in
                    DetailView(item: item)
                }
        }
    }
}
```

- WHY: NavigationPath를 사용하면 딥링크, 푸시 알림에서의 화면 이동, 조건부 네비게이션, 스택 전체 초기화를 프로그래매틱하게 제어할 수 있다. Bool/Optional 바인딩 기반 네비게이션보다 확장성이 훨씬 좋다.

### sheet/fullScreenCover의 item 기반 패턴

```swift
// ❌ Bool 기반 — 어떤 항목을 보여줄지 별도 상태 필요
@State private var showDetail = false
@State private var selectedItem: Item?

.sheet(isPresented: $showDetail) {
    if let item = selectedItem {
        DetailView(item: item)  // selectedItem이 nil이면?
    }
}

// ✅ item 기반 — 상태 일관성 보장
@State private var selectedItem: Item?

.sheet(item: $selectedItem) { item in
    DetailView(item: item)  // item은 항상 non-nil
}
```

- WHY: Bool 기반은 `showDetail = true`인데 `selectedItem = nil`인 불일치 상태가 가능하다. item 기반은 non-nil일 때만 sheet가 표시되므로 상태 불일치가 원천적으로 불가능하다. 상태 하나로 표시 여부와 데이터를 동시에 관리한다.

---

## 새로운 패턴

### .task(id:) 활용

```swift
struct UserProfileView: View {
    let userID: String
    @State private var profile: Profile?

    var body: some View {
        ProfileContent(profile: profile)
            .task(id: userID) {
                // userID가 변경될 때마다 이전 task 취소 후 새로 실행
                profile = await fetchProfile(userID)
            }
    }
}
```

- WHY: .task(id:)는 id 값이 변경될 때 기존 Task를 자동 취소하고 새 Task를 시작한다. 사용자가 빠르게 프로필을 전환할 때 이전 요청이 자동으로 취소되어 경쟁 조건(race condition)을 방지한다. 별도의 cancellation 로직이 필요 없다.

### @Bindable 패턴

```swift
@Observable
final class FormModel {
    var name: String = ""
    var email: String = ""
    var agreeToTerms: Bool = false
}

struct FormView: View {
    // 방법 1: View 내부에서 @Bindable 선언
    var model: FormModel  // 일반 프로퍼티로 주입

    var body: some View {
        @Bindable var model = model  // body 내부에서 바인딩 활성화
        Form {
            TextField("이름", text: $model.name)
            TextField("이메일", text: $model.email)
            Toggle("약관 동의", isOn: $model.agreeToTerms)
        }
    }
}

struct ParentView: View {
    // 방법 2: 프로퍼티 레벨에서 @Bindable 선언
    @Bindable var model: FormModel

    var body: some View {
        TextField("이름", text: $model.name)
    }
}
```

- WHY: @Observable 객체는 ObservableObject와 달리 $ 접두사를 바로 사용할 수 없다. @Bindable은 @Observable 객체의 프로퍼티에 대한 Binding을 생성하는 유일한 공식 방법이다. body 내부 또는 프로퍼티 레벨 두 곳 모두에서 선언할 수 있다.

### View 분해 기준: 언제 서브뷰로 추출하는가

```
"이 코드를 서브뷰로 추출해야 하는가?"
│
├─ "다른 곳에서 재사용하는가?" → ✅ 추출
│
├─ "body가 100줄 이상이고 논리적 영역이 구분되는가?" → ✅ 추출
│
├─ "자체 @State가 필요한 독립적 동작이 있는가?" → ✅ 추출
│   WHY: 독립 상태를 가진 서브뷰는 상태 변경 시 자기만 리렌더된다
│
├─ "단순히 body가 길어서?" → ❌ 추출하지 않음
│   WHY: 의미 없는 추출은 데이터 흐름을 파악하기 어렵게 만든다
│
└─ "computed property로 충분한가?" → computed property 사용
    WHY: 서브뷰 추출 없이도 가독성을 높일 수 있다
```

```swift
// ✅ computed property로 가독성 확보 (서브뷰 불필요)
struct OrderView: View {
    let order: Order

    private var headerSection: some View {
        VStack(alignment: .leading) {
            Text(order.title).font(.headline)
            Text(order.date.formatted()).font(.caption)
        }
    }

    private var itemsSection: some View {
        ForEach(order.items) { item in
            ItemRow(item: item)
        }
    }

    var body: some View {
        List {
            Section("주문 정보") { headerSection }
            Section("항목") { itemsSection }
        }
    }
}
```

- WHY: 서브뷰 추출은 struct를 새로 만들고 init 파라미터를 정의해야 한다. computed property는 같은 View 내에서 코드를 분리하면서도 모든 프로퍼티에 접근할 수 있다. 재사용이 필요하지 않다면 computed property가 더 단순하다.

### GeometryReader 최소화 패턴

```swift
// ❌ 최상위에 GeometryReader — 전체 레이아웃에 영향
var body: some View {
    GeometryReader { geo in
        VStack {
            Text("제목")
            Image("photo")
                .frame(width: geo.size.width * 0.8)
            Text("설명")
        }
    }
}

// ✅ 필요한 곳에만 최소 범위로 사용
var body: some View {
    VStack {
        Text("제목")
        Image("photo")
            .overlay(
                GeometryReader { geo in
                    Color.clear.preference(
                        key: ImageWidthKey.self,
                        value: geo.size.width
                    )
                }
            )
        Text("설명")
    }
}

// ✅✅ 가능하면 GeometryReader 대신 상대 레이아웃 사용
var body: some View {
    VStack {
        Text("제목")
        Image("photo")
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 32)
        Text("설명")
    }
}
```

- WHY: GeometryReader는 사용 가능한 공간을 모두 차지(proposed size를 모두 수락)하며, 자식에게 크기를 전달하는 과정에서 추가 레이아웃 패스가 필요하다. 최상위에 배치하면 모든 자식의 레이아웃 계산이 복잡해지고, 크기가 0에서 시작하여 깜빡이는 현상이 발생할 수 있다. .frame, .padding, containerRelativeFrame(iOS 17+) 등으로 해결 가능하다면 GeometryReader를 쓰지 않는다.

---

## 리소스

- [SwiftUI — Apple Developer Documentation](https://developer.apple.com/documentation/swiftui)
- [Managing model data in your app](https://developer.apple.com/documentation/swiftui/managing-model-data-in-your-app)
- [WWDC23: Discover Observation in SwiftUI](https://developer.apple.com/videos/play/wwdc2023/10149/)
- [WWDC23: Demystify SwiftUI performance](https://developer.apple.com/videos/play/wwdc2023/10160/)
- [WWDC22: The SwiftUI cookbook for navigation](https://developer.apple.com/videos/play/wwdc2022/10054/)
- [WWDC21: Demystify SwiftUI](https://developer.apple.com/videos/play/wwdc2021/10022/)
