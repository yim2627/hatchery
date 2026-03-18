# Swift Concurrency 안티패턴

심각도별로 정리한 안티패턴과 수정 방법.

## 체크리스트

| ID | 안티패턴 | 심각도 | 탐지 규칙 | 수정 방법 |
|---|---|---|---|---|
| C1 | async에서 블로킹 | CRITICAL | `semaphore.wait()`, `DispatchQueue.sync`, `Thread.sleep`이 async 함수 안에 있음 | async/await로 교체 |
| C2 | Continuation 이중 resume | CRITICAL | `continuation.resume`이 같은 스코프에서 2회 이상 호출 | 모든 경로에서 정확히 1회만 resume |
| C3 | Sendable 위반 | CRITICAL | non-Sendable class를 actor 경계 넘김 | struct 변환 또는 Sendable 준수 |
| C4 | Actor 재진입 경쟁 | CRITICAL | await 전에 읽은 값을 await 후에 사용 | await 후 다시 읽거나 직접 변경 |
| C5 | 취소된 Task가 상태 덮어쓰기 | CRITICAL | Task 내부에서 취소 체크 없이 상태 갱신 | 이전 Task 취소 + `Task.isCancelled` 체크 |
| W1 | 비구조적 Task 남용 | WARNING | 병렬 작업에 `Task { }` 각각 생성 | `async let` 또는 `TaskGroup` 사용 |
| W2 | Task.detached 남용 | WARNING | `Task.detached` 사용 | 일반 Task 사용 (취소 전파 유지) |
| W3 | 긴 루프에서 취소 체크 없음 | WARNING | 루프 안에 `Task.checkCancellation()` 없음 | `try Task.checkCancellation()` 추가 |
| W4 | @MainActor 과다 사용 | WARNING | 전체 class에 `@MainActor` 적용 | UI 메서드만 선택적으로 `@MainActor` |

## 목차

- C1. async 컨텍스트에서 블로킹
- C2. Continuation 이중 resume
- C3. Sendable 위반
- C4. Actor 재진입 경쟁
- C5. 취소된 Task가 최신 상태 덮어쓰기
- W1. 비구조적 Task 남용
- W2. Task.detached 남용
- W3. 긴 루프에서 취소 체크 없음
- W4. @MainActor 과다 사용
- 변환 패턴: Completion Handler → async/await, DispatchGroup → TaskGroup, NotificationCenter → AsyncSequence

---

## CRITICAL — 런타임 크래시·데드락

### C1. async 컨텍스트에서 블로킹

```swift
// ❌ 데드락 위험
func fetchData() async {
    let semaphore = DispatchSemaphore(value: 0)
    URLSession.shared.dataTask(with: url) { data, _, _ in
        self.data = data
        semaphore.signal()
    }.resume()
    semaphore.wait() // async 컨텍스트에서 블로킹 → 데드락
}

// ✅ async/await 사용
func fetchData() async throws {
    let (data, _) = try await URLSession.shared.data(from: url)
    self.data = data
}
```

탐지: `semaphore.wait()`, `DispatchQueue.sync`, `Thread.sleep`이 async 함수 안에 있으면.

### C2. Continuation 이중 resume

```swift
// ❌ 크래시
func legacy() async throws -> Data {
    try await withCheckedThrowingContinuation { continuation in
        api.fetch { result in
            switch result {
            case .success(let data):
                continuation.resume(returning: data)
            case .failure(let error):
                continuation.resume(throwing: error)
            }
            continuation.resume(returning: Data()) // 두 번째 호출 → 크래시
        }
    }
}

// ✅ 모든 경로에서 정확히 한 번만 resume
func legacy() async throws -> Data {
    try await withCheckedThrowingContinuation { continuation in
        api.fetch { result in
            switch result {
            case .success(let data):
                continuation.resume(returning: data)
            case .failure(let error):
                continuation.resume(throwing: error)
            }
        }
    }
}
```

### C3. Sendable 위반

```swift
// ❌ non-Sendable 타입을 actor 경계 넘김
class MutableConfig {
    var values: [String: Any] = [:]
}

actor DataStore {
    func save(config: MutableConfig) { // 경고: non-Sendable
        // ...
    }
}

// ✅ struct로 변환하거나 Sendable 준수
struct ImmutableConfig: Sendable {
    let values: [String: String]
}

actor DataStore {
    func save(config: ImmutableConfig) {
        // ...
    }
}
```

### C4. Actor 재진입 경쟁

```swift
// ❌ await 후 상태 가정
actor Counter {
    var count = 0

    func increment() async {
        let current = count
        await someAsyncWork()
        count = current + 1 // await 사이에 다른 호출이 count를 바꿨을 수 있음
    }
}

// ✅ await 후 다시 읽거나 트랜잭션 패턴
actor Counter {
    var count = 0

    func increment() async {
        await someAsyncWork()
        count += 1 // 직접 변경
    }
}
```

### C5. 취소된 Task가 최신 상태 덮어쓰기

```swift
// ❌ 이전 요청 결과가 최신 결과를 덮어씀
class ViewModel: ObservableObject {
    @Published var result: String = ""

    func search(_ query: String) {
        Task {
            let data = try await api.search(query)
            self.result = data // 이전 Task가 나중에 완료되면?
        }
    }
}

// ✅ 이전 Task 취소
class ViewModel: ObservableObject {
    @Published var result: String = ""
    private var searchTask: Task<Void, Never>?

    func search(_ query: String) {
        searchTask?.cancel()
        searchTask = Task {
            do {
                let data = try await api.search(query)
                if !Task.isCancelled {
                    self.result = data
                }
            } catch {}
        }
    }
}
```

---

## WARNING — 성능·유지보수 문제

### W1. 비구조적 Task 남용

```swift
// ❌ 병렬 작업에 Task를 각각 생성
func loadAll() async {
    Task { await loadProfile() }
    Task { await loadSettings() }
    Task { await loadHistory() }
    // 완료 시점을 알 수 없음
}

// ✅ async let 또는 TaskGroup
func loadAll() async {
    async let profile = loadProfile()
    async let settings = loadSettings()
    async let history = loadHistory()
    let (p, s, h) = await (profile, settings, history)
}
```

### W2. Task.detached 남용

```swift
// ❌ 취소 전파가 끊김
func process() async {
    Task.detached {
        await self.heavyWork() // 부모 Task 취소해도 이건 계속 돌아감
    }
}

// ✅ 일반 Task 사용 (취소 전파 유지)
func process() async {
    await heavyWork()
}
```

### W3. 긴 루프에서 취소 체크 없음

```swift
// ❌
func processItems(_ items: [Item]) async throws {
    for item in items {
        await process(item) // 수천 개면 취소해도 안 멈춤
    }
}

// ✅
func processItems(_ items: [Item]) async throws {
    for item in items {
        try Task.checkCancellation()
        await process(item)
    }
}
```

### W4. @MainActor 과다 사용

```swift
// ❌ 전체 클래스에 MainActor
@MainActor
class DataProcessor {
    func heavyComputation() { /* 메인 스레드 블로킹 */ }
    func updateUI() { /* 이것만 MainActor 필요 */ }
}

// ✅ 필요한 부분만
class DataProcessor {
    nonisolated func heavyComputation() async { /* 백그라운드 */ }
    @MainActor func updateUI() { /* UI 업데이트만 */ }
}
```

---

## 변환 패턴

### Completion Handler → async/await

```swift
// Before
func fetch(completion: @escaping (Result<User, Error>) -> Void) {
    URLSession.shared.dataTask(with: request) { data, _, error in
        if let error { completion(.failure(error)); return }
        let user = try? JSONDecoder().decode(User.self, from: data!)
        completion(.success(user!))
    }.resume()
}

// After
func fetch() async throws -> User {
    let (data, _) = try await URLSession.shared.data(for: request)
    return try JSONDecoder().decode(User.self, from: data)
}
```

### DispatchGroup → TaskGroup

```swift
// Before
func loadAll(ids: [String], completion: @escaping ([Item]) -> Void) {
    let group = DispatchGroup()
    var items: [Item] = []
    for id in ids {
        group.enter()
        fetchItem(id) { item in
            items.append(item)
            group.leave()
        }
    }
    group.notify(queue: .main) { completion(items) }
}

// After
func loadAll(ids: [String]) async -> [Item] {
    await withTaskGroup(of: Item?.self) { group in
        for id in ids {
            group.addTask { try? await self.fetchItem(id) }
        }
        var items: [Item] = []
        for await item in group {
            if let item { items.append(item) }
        }
        return items
    }
}
```

### NotificationCenter → AsyncSequence

```swift
// Before
NotificationCenter.default.addObserver(
    self, selector: #selector(handleChange),
    name: .dataDidChange, object: nil
)

// After
for await _ in NotificationCenter.default.notifications(named: .dataDidChange) {
    await handleChange()
}
```
