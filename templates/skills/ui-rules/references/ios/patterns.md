# SwiftUI 패턴과 안티패턴

## 목차

- @Observable 마이그레이션 (iOS 17+) — ObservableObject → @Observable 전환 가이드
- 안티패턴: body에서 무거운 작업, .onAppear 반복 로드, Bool 플래그 조합, NavigationLink 즉시 초기화
- 성능 패턴: LazyVStack, Equatable View

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

---

## 안티패턴

### body에서 무거운 작업

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

### .onAppear에서 반복 로드

```swift
// ❌ 탭 전환할 때마다 다시 로드
var body: some View {
    List(items) { item in
        ItemRow(item: item)
    }
    .onAppear { Task { await loadItems() } }
}

// ✅ 로드 상태 확인
var body: some View {
    List(items) { item in
        ItemRow(item: item)
    }
    .task {
        if items.isEmpty { await loadItems() }
    }
}
```

### 상태 enum 없이 Bool 플래그 조합

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

### NavigationLink에서 destination 즉시 초기화

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
