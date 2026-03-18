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
| S1 | @preconcurrency로 경고 숨기기 | CRITICAL | `@preconcurrency import`가 마이그레이션 계획 없이 사용됨 | Sendable 준수로 마이그레이션 |
| S2 | @unchecked Sendable 남용 | CRITICAL | `@unchecked Sendable`에 정당화 코멘트 없음 | actor 변환 또는 잠금 + 코멘트 |
| S3 | nonisolated(unsafe) 사용 | CRITICAL | `nonisolated(unsafe)` 키워드 존재 | actor 격리 또는 Sendable 준수로 대체 |
| S4 | GlobalActor를 모듈 전체에 적용 | WARNING | 파일/모듈 최상위에 `@MainActor` 또는 `@globalActor` 적용 | 필요한 타입/메서드에만 선택 적용 |
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
- S1. @preconcurrency로 경고 숨기기 (Swift 6)
- S2. @unchecked Sendable 남용 (Swift 6)
- S3. nonisolated(unsafe) 사용 (Swift 6)
- S4. GlobalActor를 모듈 전체에 적용 (Swift 6)
- W1. 비구조적 Task 남용
- W2. Task.detached 남용
- W3. 긴 루프에서 취소 체크 없음
- W4. @MainActor 과다 사용
- 변환 패턴: Completion Handler → async/await, DispatchGroup → TaskGroup, NotificationCenter → AsyncSequence

---

## CRITICAL — 런타임 크래시·데드락

### C1. async 컨텍스트에서 블로킹

**WHY**: Swift Concurrency의 cooperative thread pool은 스레드 수가 제한되어 있다. 블로킹하면 다른 Task가 실행할 스레드를 빼앗겨 데드락이 발생한다.

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

**WHY**: `CheckedContinuation`은 정확히 1회만 resume할 수 있다. 2회 호출하면 런타임 크래시, 0회면 Task가 영원히 suspend된다.

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

**WHY**: non-Sendable 타입을 actor 경계 너머로 전달하면 동시에 두 격리 도메인에서 같은 참조를 변경할 수 있다. Swift 6에서는 컴파일 에러, Swift 5에서는 런타임 data race다.

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

**WHY**: actor는 `await` 지점에서 다른 메시지를 처리할 수 있다(재진입). `await` 전에 읽은 상태가 `await` 후에도 동일하다고 가정하면 논리적 data race가 발생한다.

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

**WHY**: 이전 요청의 응답이 최신 요청보다 늦게 도착하면 UI가 stale 데이터를 표시한다. 사용자가 "B"를 검색했는데 "A"의 결과가 보이는 상황이 발생한다.

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

## CRITICAL — Swift 6 Strict Concurrency

### S1. @preconcurrency로 경고 숨기기

**WHY**: `@preconcurrency`는 마이그레이션 과도기용이다. 영구적으로 남겨두면 Sendable 위반이 숨겨진 채로 런타임 data race가 유지되고, Swift 6 완전 전환이 불가능해진다.

```swift
// ❌ 마이그레이션 계획 없이 경고 숨기기
@preconcurrency import OldNetworkingLib

func fetchUser() async -> User {
    await OldNetworkingLib.getUser() // Sendable 위반이 숨겨짐
}

// ✅ 어댑터로 Sendable 경계 확보 + @preconcurrency 제거 계획
import OldNetworkingLib

struct UserDTO: Sendable { // Sendable 어댑터
    let id: String
    let name: String
}

func fetchUser() async -> UserDTO {
    let raw = await OldNetworkingLib.getUser()
    return UserDTO(id: raw.id, name: raw.name) // 경계에서 Sendable로 변환
}
```

탐지: `@preconcurrency import`가 TODO/마이그레이션 코멘트 없이 존재.

### S2. @unchecked Sendable 남용

**WHY**: `@unchecked Sendable`은 컴파일러의 data race 검증을 완전히 우회한다. 내부에 잠금(Lock/Mutex)이 없으면 Swift 6에서도 data race가 런타임에 발생하며, 컴파일러가 이를 잡아주지 못한다.

```swift
// ❌ 잠금 없이 @unchecked Sendable
class SharedCache: @unchecked Sendable {
    var items: [String: Data] = [:] // 동시 접근 시 data race
}

// ✅ 내부 잠금 + 정당화 코멘트
import os

// @unchecked Sendable 정당화: OSAllocatedUnfairLock으로 모든 mutable state 보호
final class SharedCache: @unchecked Sendable {
    private let lock = OSAllocatedUnfairLock(initialState: [String: Data]())

    func get(_ key: String) -> Data? {
        lock.withLock { $0[key] }
    }

    func set(_ key: String, data: Data) {
        lock.withLock { $0[key] = data }
    }
}
```

탐지: `@unchecked Sendable`에 정당화 코멘트가 없거나, 내부 동기화 메커니즘이 없음.

### S3. nonisolated(unsafe) 사용

**WHY**: `nonisolated(unsafe)`는 actor 격리를 완전히 무시한다. 컴파일러가 동시 접근을 검증하지 않으므로 Swift Concurrency의 안전성 보장이 무효화된다. 사실상 `@unchecked Sendable`보다 더 위험하다.

```swift
// ❌ 격리 우회
actor UserManager {
    nonisolated(unsafe) var currentUser: User? // 어떤 스레드에서든 접근 가능 → data race
}

// ✅ actor 격리 유지 + 필요시 nonisolated 읽기 전용 프로퍼티
actor UserManager {
    private(set) var currentUser: User?

    nonisolated var cachedUserName: String { // 불변 데이터만 nonisolated
        "cached"
    }

    func updateUser(_ user: User) {
        currentUser = user
    }
}
```

탐지: `nonisolated(unsafe)` 키워드 존재.

### S4. GlobalActor를 모듈 전체에 적용

**WHY**: 모듈 전체에 `@MainActor`를 적용하면 네트워크 호출, JSON 파싱, 이미지 처리 등 CPU 작업까지 메인 스레드에서 실행된다. 불필요한 actor hop이 발생하고 UI가 버벅거린다.

```swift
// ❌ 파일 최상위 또는 모듈 전체에 적용
@MainActor
enum AppModule {
    static func parseJSON(_ data: Data) -> Model { /* 메인 스레드에서 파싱 */ }
    static func processImage(_ image: UIImage) -> UIImage { /* 메인 스레드에서 처리 */ }
    static func updateUI(_ model: Model) { /* 이것만 MainActor 필요 */ }
}

// ✅ 필요한 곳에만 선택적 적용
enum AppModule {
    nonisolated static func parseJSON(_ data: Data) -> Model { /* 백그라운드 */ }
    nonisolated static func processImage(_ image: UIImage) -> UIImage { /* 백그라운드 */ }
    @MainActor static func updateUI(_ model: Model) { /* UI 업데이트만 */ }
}
```

탐지: 파일 또는 모듈 최상위 레벨에 `@MainActor` / `@globalActor` 적용.

---

## 결정 다이어그램: Sendable 위반 해결 플로우

```
Sendable 위반 경고/에러 발생
│
├── 타입을 변경할 수 있는가?
│   ├── 예
│   │   ├── class → struct로 변환 가능? → struct로 변환 (최선)
│   │   ├── class 유지 필요?
│   │   │   ├── mutable state 제거 가능? → let만 사용 + final class: Sendable
│   │   │   ├── actor로 변환 가능? → actor 사용 (권장)
│   │   │   └── actor 불가? → @unchecked Sendable + Lock + 정당화 코멘트
│   │   └── 클로저 캡처 문제? → 캡처 값을 Sendable 타입으로 변환
│   └── 아니오 (외부 라이브러리)
│       ├── 라이브러리 업데이트로 해결? → 업데이트
│       ├── 어댑터 패턴 사용 → Sendable wrapper 생성
│       └── 최후의 수단 → @preconcurrency import + TODO 마이그레이션 코멘트
│
└── 위반을 무시하고 싶다면?
    └── 절대 하지 않는다. Swift 6에서 컴파일 에러가 된다.
```

---

## WARNING — 성능·유지보수 문제

### W1. 비구조적 Task 남용

**WHY**: 각각의 `Task { }`는 독립적이어서 완료 시점을 알 수 없고, 에러 전파와 취소가 자동으로 이루어지지 않는다. 구조적 동시성(`async let`, `TaskGroup`)은 이 모든 것을 자동 관리한다.

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

**WHY**: `Task.detached`는 부모 Task의 priority, actor 격리, 취소 전파를 모두 상속하지 않는다. 부모를 취소해도 detached Task는 계속 실행되어 리소스가 낭비된다.

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

**WHY**: Swift의 Task 취소는 협력적이다. `checkCancellation()`을 호출하지 않으면 취소 요청을 무시하고 수천 번의 반복을 끝까지 실행한다. 배터리와 CPU를 낭비한다.

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

**WHY**: `@MainActor`를 전체 클래스에 적용하면 CPU 집약적 메서드까지 메인 스레드에서 실행된다. 16ms(60fps) 안에 끝나지 않는 작업은 프레임 드롭을 유발한다.

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

---

## 리소스

- [Swift Concurrency — The Swift Programming Language](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)
- [Sendable — Swift Standard Library](https://developer.apple.com/documentation/swift/sendable)
- [WWDC22: Eliminate data races using Swift Concurrency](https://developer.apple.com/videos/play/wwdc2022/110351/)
- [WWDC22: Visualize and optimize Swift concurrency](https://developer.apple.com/videos/play/wwdc2022/110350/)
- [WWDC21: Meet async/await in Swift](https://developer.apple.com/videos/play/wwdc2021/10132/)
- [WWDC21: Protect mutable state with Swift actors](https://developer.apple.com/videos/play/wwdc2021/10133/)
- [Swift 6 Migration Guide — swift.org](https://www.swift.org/migration/documentation/migrationguide/)
