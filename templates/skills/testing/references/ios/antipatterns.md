# iOS 테스트 안티패턴

심각도별로 정리한 안티패턴과 수정 방법.

## 체크리스트

| ID | 안티패턴 | 심각도 | 탐지 규칙 | 수정 방법 |
|---|---|---|---|---|
| C1 | 테스트에서 실제 네트워크 호출 | CRITICAL | 테스트 파일에서 `URLSession`, `AF.request` 직접 호출 | 프로토콜 기반 mock 사용 |
| C2 | 테스트 간 상태 공유 | CRITICAL | `static var`로 테스트 간 데이터 전달 | 각 테스트에서 독립적으로 setUp |
| C3 | 구현 세부사항 테스트 | CRITICAL | 내부 메서드 호출 순서·횟수 검증 | 최종 동작(결과)만 검증 |
| C4 | force unwrap으로 크래시 | CRITICAL | 테스트 코드에서 `try!`, `!` 사용 | `XCTUnwrap`, `throws` 사용 |
| W1 | 과도한 mock | WARNING | 테스트당 mock 4개 이상 | 핵심 의존성만 mock |
| W2 | 비동기 테스트에서 sleep | WARNING | 테스트에서 `Task.sleep`, `Thread.sleep` 사용 | 조건 기반 대기 (expectation) |
| W3 | 의미 없는 테스트 이름 | WARNING | `testUser`, `testSuccess`, `test1` 등 | given_when_then 형식 |
| W4 | happy path만 테스트 | WARNING | 에러·엣지 케이스 테스트 없음 | 에러·빈값·경계값 테스트 추가 |

## 목차

- C1. 테스트에서 실제 네트워크 호출
- C2. 테스트 간 상태 공유
- C3. 구현 세부사항 테스트
- C4. force unwrap으로 테스트 크래시
- W1. 과도한 mock
- W2. 비동기 테스트에서 sleep 사용
- W3. 테스트 이름이 의미 없음
- W4. happy path만 테스트
- 변환 패턴: XCTest → Swift Testing, XCTestExpectation → async/await, Mock → Fake

---

## CRITICAL — 신뢰할 수 없는 테스트

### C1. 테스트에서 실제 네트워크 호출

```swift
// ❌ 외부 서버 상태에 테스트가 의존
func testFetchUser() async throws {
    let repo = UserRepository()
    let user = try await repo.fetchUser(id: "123") // 실제 API 호출
    XCTAssertEqual(user.name, "John")
}

// ✅ 프로토콜 기반 mock 사용
protocol APIClientProtocol: Sendable {
    func request<T: Decodable>(_ endpoint: Endpoint) async throws -> T
}

struct MockAPIClient: APIClientProtocol {
    var result: Any?
    var error: Error?

    func request<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        if let error { throw error }
        return result as! T
    }
}

func testFetchUser() async throws {
    let mock = MockAPIClient(result: User(id: "123", name: "John"))
    let repo = UserRepository(apiClient: mock)
    let user = try await repo.fetchUser(id: "123")
    XCTAssertEqual(user.name, "John")
}
```

**WHY:** 실제 API를 호출하면 서버 장애, 네트워크 불안정, 레이트 리밋으로 테스트가 무작위로 실패한다. 테스트는 외부 상태에 의존하지 않아야 한다.

### C2. 테스트 간 상태 공유 — 실행 순서에 따라 결과 달라짐

```swift
// ❌ static 변수로 테스트 간 상태 오염
class UserServiceTests: XCTestCase {
    static var sharedUser: User?

    func testCreateUser() {
        Self.sharedUser = UserService.create(name: "Test")
        XCTAssertNotNil(Self.sharedUser)
    }

    func testDeleteUser() {
        // testCreateUser가 먼저 실행되어야만 통과
        UserService.delete(Self.sharedUser!)
    }
}

// ✅ 각 테스트가 독립적으로 상태를 설정
class UserServiceTests: XCTestCase {
    private var sut: UserService!
    private var mockStorage: MockStorage!

    override func setUp() {
        mockStorage = MockStorage()
        sut = UserService(storage: mockStorage)
    }

    func testDeleteUser() {
        let user = sut.create(name: "Test")
        sut.delete(user)
        XCTAssertTrue(mockStorage.isEmpty)
    }
}
```

**WHY:** 테스트 A가 설정한 static 변수를 테스트 B가 사용하면, A가 먼저 실행되어야만 B가 통과한다. 병렬 실행이나 순서 변경 시 의미 없는 실패가 발생한다.

### C3. 구현 세부사항 테스트 — 리팩토링하면 깨짐

```swift
// ❌ 내부 메서드 호출 순서를 검증
func testLoadProfile() async {
    await vm.loadProfile()
    XCTAssertEqual(mock.callOrder, ["fetchUser", "fetchAvatar", "cacheResult"])
    // 내부 구현을 바꾸면 테스트도 바꿔야 함
}

// ✅ 최종 동작(결과)을 검증
func testLoadProfile() async {
    await vm.loadProfile()
    XCTAssertEqual(vm.state, .loaded)
    XCTAssertEqual(vm.userName, "John")
}
```

**WHY:** 내부 구현(호출 순서, 메서드명)을 테스트하면 리팩토링할 때마다 테스트가 깨진다. 최종 결과만 검증하면 내부를 자유롭게 바꿀 수 있다.

### C4. force unwrap으로 테스트 크래시

```swift
// ❌ 실패 시 크래시 — 어디서 실패했는지 모름
func testParsing() {
    let data = loadJSON("user.json")
    let user = try! JSONDecoder().decode(User.self, from: data!) // 크래시
    XCTAssertEqual(user.name, "John")
}

// ✅ 명확한 실패 메시지
func testParsing() throws {
    let data = try XCTUnwrap(loadJSON("user.json"), "user.json을 찾을 수 없음")
    let user = try JSONDecoder().decode(User.self, from: data)
    XCTAssertEqual(user.name, "John")
}
```

**WHY:** `try!`로 크래시하면 "어떤 값이 nil이었는지" 알 수 없다. `XCTUnwrap`은 실패 위치와 메시지를 명확히 보여준다.

---

## WARNING — 유지보수·품질 문제

### W1. 과도한 mock — 테스트가 mock 구현을 테스트

```swift
// ❌ 모든 의존성을 mock → mock이 실제와 다르게 동작할 위험
func testCheckout() async {
    let mockCart = MockCart(items: [.mock])
    let mockPayment = MockPaymentService(result: .success)
    let mockAnalytics = MockAnalytics()
    let mockLogger = MockLogger()
    let sut = CheckoutService(
        cart: mockCart, payment: mockPayment,
        analytics: mockAnalytics, logger: mockLogger
    )
    // mock만 4개 — 뭘 테스트하는 건지 불분명
}

// ✅ 핵심 의존성만 mock, 나머지는 실제 또는 가벼운 fake
func testCheckout() async {
    let mockPayment = MockPaymentService(result: .success)
    let sut = CheckoutService(payment: mockPayment)
    // 결제 서비스만 mock — 테스트 의도가 명확
}
```

**WHY:** Mock이 4개 이상이면 테스트 대상 클래스의 의존성이 너무 많다는 설계 신호다. Mock 구현 자체에 버그가 있으면 테스트가 잘못된 결과를 보고한다.

### W2. 비동기 테스트에서 sleep 사용

```swift
// ❌ 고정 대기 — 느리고 불안정
func testDebounce() async {
    vm.search("hello")
    try await Task.sleep(nanoseconds: 1_000_000_000) // 1초 대기
    XCTAssertFalse(vm.results.isEmpty)
}

// ✅ 조건 기반 대기
func testDebounce() async throws {
    vm.search("hello")
    let expectation = XCTestExpectation(description: "검색 완료")
    let cancellable = vm.$results
        .dropFirst()
        .sink { _ in expectation.fulfill() }
    await fulfillment(of: [expectation], timeout: 3)
}
```

**WHY:** `sleep(1)`은 CI 환경에서 타이밍 차이로 flaky 테스트의 주범이다. 로컬에서 통과하고 CI에서 실패하는 테스트는 신뢰를 잃는다.

### W3. 테스트 이름이 의미 없음

```swift
// ❌ 무엇을 검증하는지 알 수 없음
func testUser() { ... }
func testSuccess() { ... }
func test1() { ... }

// ✅ given_when_then 또는 행동 설명
func test_fetchUser_whenNetworkFails_setsErrorState() { ... }
func test_login_withInvalidEmail_showsValidationError() { ... }
```

**WHY:** 테스트가 실패했을 때 `testUser`만으로는 무엇이 깨졌는지 알 수 없다. 이름에 조건과 기대 결과가 있으면 로그만 보고 문제를 파악할 수 있다.

### W4. happy path만 테스트

```swift
// ❌ 성공 케이스만 검증
func testFetchUser() async throws {
    let user = try await sut.fetchUser(id: "123")
    XCTAssertEqual(user.name, "John")
}

// ✅ 에러·엣지 케이스도 검증
func testFetchUser_networkError() async {
    mock.error = URLError(.notConnectedToInternet)
    await sut.fetchUser(id: "123")
    XCTAssertEqual(sut.state, .error)
}

func testFetchUser_emptyResponse() async {
    mock.result = User(id: "", name: "")
    await sut.fetchUser(id: "")
    // 빈 응답에 대한 기대 동작 검증
}
```

**WHY:** 실제 유저는 네트워크 오류, 빈 응답, 잘못된 입력을 보낸다. 성공 케이스만 테스트하면 프로덕션에서 처음 보는 크래시가 발생한다.

---

## 변환 패턴

### XCTest → Swift Testing

```swift
// Before (XCTest)
import XCTest

class UserViewModelTests: XCTestCase {
    var sut: UserViewModel!

    override func setUp() {
        sut = UserViewModel(repository: MockRepository())
    }

    override func tearDown() {
        sut = nil
    }

    func testLoadUser() async throws {
        await sut.load(id: "123")
        XCTAssertEqual(sut.state, .loaded)
    }

    func testLoadUserFailure() async {
        // ...
    }
}

// After (Swift Testing)
import Testing

struct UserViewModelTests {
    let sut: UserViewModel

    init() {
        sut = UserViewModel(repository: MockRepository())
    }

    @Test func loadUser() async throws {
        await sut.load(id: "123")
        #expect(sut.state == .loaded)
    }

    @Test(arguments: ["", " ", "invalid-id"])
    func loadUser_invalidId(id: String) async {
        await sut.load(id: id)
        #expect(sut.state == .error)
    }

    @Test func loadUser_networkError() async {
        // ...
    }
}
```

핵심 차이:

| | XCTest | Swift Testing |
|---|---|---|
| 테스트 선언 | `func test...()` | `@Test func ...()` |
| 단언 | `XCTAssertEqual` | `#expect` |
| 에러 단언 | `XCTAssertThrowsError` | `#expect(throws:)` |
| 파라미터화 | 별도 메서드 복사 | `@Test(arguments:)` |
| 구조 | class + setUp/tearDown | struct + init |
| 태그 | 없음 | `@Test(.tags(.networking))` |

### XCTestExpectation → async/await 테스트

```swift
// Before — 콜백 기반 비동기 테스트
func testFetchUser() {
    let expectation = expectation(description: "user fetched")
    sut.fetchUser(id: "123") { result in
        switch result {
        case .success(let user):
            XCTAssertEqual(user.name, "John")
        case .failure:
            XCTFail("실패하면 안 됨")
        }
        expectation.fulfill()
    }
    waitForExpectations(timeout: 5)
}

// After — async/await
func testFetchUser() async throws {
    let user = try await sut.fetchUser(id: "123")
    XCTAssertEqual(user.name, "John")
}
```

### Mock 직접 구현 → 프로토콜 Fake

```swift
// Before — 매번 수동 mock
class MockUserRepository: UserRepositoryProtocol {
    var fetchUserCalled = false
    var fetchUserResult: User?
    var fetchUserError: Error?

    func fetchUser(id: String) async throws -> User {
        fetchUserCalled = true
        if let error = fetchUserError { throw error }
        return fetchUserResult!
    }
}

// After — 재사용 가능한 Fake
struct FakeUserRepository: UserRepositoryProtocol {
    var users: [String: User] = [:]
    var shouldFail: Error?

    func fetchUser(id: String) async throws -> User {
        if let error = shouldFail { throw error }
        guard let user = users[id] else { throw APIError.notFound }
        return user
    }

    func saveUser(_ user: User) async throws {
        // in-memory 저장
    }
}
```

---

## 리소스

- [Swift Testing — Apple Developer Documentation](https://developer.apple.com/documentation/testing)
- [WWDC24: Meet Swift Testing](https://developer.apple.com/videos/play/wwdc2024/10179/)
- [WWDC24: Go further with Swift Testing](https://developer.apple.com/videos/play/wwdc2024/10195/)
- [XCTest — Apple Developer Documentation](https://developer.apple.com/documentation/xctest)
