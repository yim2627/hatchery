# iOS 네트워킹 안티패턴

심각도별로 정리한 안티패턴과 수정 방법.

## 체크리스트

| ID | 안티패턴 | 심각도 | 탐지 규칙 | 수정 방법 |
|---|---|---|---|---|
| C1 | API 키·시크릿 하드코딩 | CRITICAL | 문자열에 `key=`, `token=`, `secret`, `sk_live` 포함 | xcconfig 또는 환경 변수에서 로드 |
| C2 | 에러 무시 | CRITICAL | `try!`, 빈 `catch { }`, 응답 무시 | 에러를 UI까지 전파 |
| C3 | View에서 직접 URLSession | CRITICAL | View.body 또는 .task에서 `URLSession` 직접 호출 | Repository → ViewModel → View 분리 |
| C4 | HTTP 상태 코드 무시 | CRITICAL | `URLSession.data` 후 response 상태 미확인 | statusCode 검사 + 에러 분기 |
| W1 | 워터폴 요청 | WARNING | 독립적인 await가 순차 나열 | `async let`로 병렬화 |
| W2 | 재시도 없는 일회성 요청 | WARNING | GET 요청에 재시도 로직 없음 | 지수 백오프 재시도 추가 |
| W3 | JSONDecoder 매번 생성 | WARNING | 함수 안에서 `JSONDecoder()` 새로 생성 | 공유 디코더 사용 |
| W4 | URLSession 기본 설정 방치 | WARNING | `URLSession.shared` 직접 사용, 타임아웃 미설정 | 용도별 Configuration 설정 |

## 목차

- C1. API 키·시크릿 하드코딩
- C2. 에러 무시 — 실패해도 모름
- C3. View에서 직접 URLSession 호출
- C4. HTTP 응답 상태 코드 무시
- W1. 워터폴 요청
- W2. 재시도 없는 일회성 요청
- W3. JSONDecoder를 매번 새로 생성
- W4. URLSession 설정을 기본값으로 방치
- 변환 패턴: Completion Handler → async/await, Alamofire 콜백 → async, URLRequest 수동 → 타입 안전 API

---

## CRITICAL — 보안·크래시·데이터 손실

### C1. API 키·시크릿 하드코딩

```swift
// ❌ 소스 코드에 키 노출
let url = URL(string: "https://api.example.com/data?key=sk_live_abc123")!

struct APIConfig {
    static let secret = "my-secret-token" // Git에 올라감
}

// ✅ 환경 변수 또는 .xcconfig에서 로드
enum APIConfig {
    static let apiKey: String = {
        guard let key = Bundle.main.infoDictionary?["API_KEY"] as? String, !key.isEmpty else {
            fatalError("API_KEY not configured in xcconfig")
        }
        return key
    }()
}
```

탐지: 문자열 리터럴에 `key=`, `token=`, `secret`, `sk_live`, `sk_test` 포함.

**WHY:** 소스 코드에 하드코딩된 시크릿은 Git 히스토리에 영구적으로 남는다. 공개 저장소는 물론 비공개 저장소도 유출 시 즉시 악용된다.

### C2. 에러 무시 — 실패해도 모름

```swift
// ❌ 에러 삼킴
func fetchUser() async {
    let (data, _) = try! await URLSession.shared.data(from: url)
    let user = try! JSONDecoder().decode(User.self, from: data)
    self.user = user
}

// ❌ catch에서 아무것도 안 함
func fetchUser() async {
    do {
        let (data, _) = try await URLSession.shared.data(from: url)
        self.user = try JSONDecoder().decode(User.self, from: data)
    } catch {
        // 무시
    }
}

// ✅ 에러 경로를 UI까지 전파
func fetchUser() async {
    do {
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.invalidResponse
        }
        self.user = try JSONDecoder().decode(User.self, from: data)
    } catch is CancellationError {
        // 취소는 에러가 아님
    } catch {
        self.state = .error(error)
    }
}
```

**WHY:** 에러를 삼키면 유저는 로딩이 끝나지 않는 빈 화면을 보게 된다. `try!`는 프로덕션에서 크래시, 빈 catch는 무한 로딩을 유발한다.

### C3. View에서 직접 URLSession 호출

```swift
// ❌ View가 네트워킹을 직접 수행
struct UserView: View {
    @State private var user: User?

    var body: some View {
        Text(user?.name ?? "Loading...")
            .task {
                let (data, _) = try! await URLSession.shared.data(from: someURL)
                user = try! JSONDecoder().decode(User.self, from: data)
            }
    }
}

// ✅ Repository → ViewModel → View
struct UserView: View {
    @State private var vm: UserViewModel

    var body: some View {
        Group {
            switch vm.state {
            case .idle, .loading: ProgressView()
            case .loaded(let user): Text(user.name)
            case .error(let error): Text(error.localizedDescription)
            }
        }
        .task { await vm.load() }
    }
}
```

**WHY:** View가 네트워킹을 직접 수행하면 같은 API 호출이 여러 View에 중복되고, 캐싱/에러 처리 로직이 분산된다. Repository 패턴으로 분리하면 테스트와 재사용이 용이하다.

### C4. HTTP 응답 상태 코드 무시

```swift
// ❌ 상태 코드를 확인하지 않음
let (data, _) = try await URLSession.shared.data(from: url)
let user = try JSONDecoder().decode(User.self, from: data)
// 401, 500 등이 와도 디코딩 시도 → 의미 없는 에러 메시지

// ✅ 상태 코드 확인 후 처리
let (data, response) = try await URLSession.shared.data(from: url)
guard let http = response as? HTTPURLResponse else {
    throw APIError.invalidResponse
}

switch http.statusCode {
case 200...299:
    return try JSONDecoder().decode(User.self, from: data)
case 401:
    throw APIError.unauthorized
case 429:
    throw APIError.rateLimited
default:
    throw APIError.server(statusCode: http.statusCode)
}
```

**WHY:** URLSession은 4xx/5xx를 에러로 throw하지 않는다. 상태 코드를 무시하면 에러 응답 바디를 정상 데이터로 디코딩하여 의미 없는 에러 메시지가 표시된다.

---

## WARNING — 성능·유지보수 문제

### W1. 워터폴 요청 — 독립 요청을 순차 실행

```swift
// ❌ 3개 요청이 직렬로 실행
func loadDashboard() async throws {
    let profile = try await api.fetchProfile()
    let posts = try await api.fetchPosts()       // profile 끝날 때까지 대기
    let notifications = try await api.fetchNotifications() // posts 끝날 때까지 대기
}

// ✅ 독립 요청은 병렬 실행
func loadDashboard() async throws {
    async let profile = api.fetchProfile()
    async let posts = api.fetchPosts()
    async let notifications = api.fetchNotifications()
    let (p, ps, n) = try await (profile, posts, notifications)
}
```

**WHY:** 3개 독립 요청이 각 500ms면 순차 실행 시 1.5초, 병렬 실행 시 500ms다. 대시보드처럼 여러 데이터를 동시에 로드하는 화면에서 차이가 크다.

### W2. 재시도 없는 일회성 요청

```swift
// ❌ 일시적 네트워크 오류에도 바로 실패
func fetchData() async throws -> Data {
    let (data, _) = try await URLSession.shared.data(from: url)
    return data
}

// ✅ 멱등 GET 요청에 지수 백오프 재시도
func fetchData(maxRetries: Int = 3) async throws -> Data {
    for attempt in 0..<maxRetries {
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                throw APIError.invalidResponse
            }
            return data
        } catch where attempt < maxRetries - 1 {
            let delay = UInt64(pow(2.0, Double(attempt))) * 1_000_000_000
            try await Task.sleep(nanoseconds: delay)
        }
    }
    throw APIError.maxRetriesExceeded
}
```

**WHY:** 일시적 네트워크 불안정(터널 진입, Wi-Fi 전환)은 재시도로 해결될 수 있다. 멱등 GET 요청은 재시도해도 부작용이 없다.

### W3. JSONDecoder를 매번 새로 생성

```swift
// ❌ 호출마다 디코더 생성
func decode<T: Decodable>(_ data: Data) throws -> T {
    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    decoder.dateDecodingStrategy = .iso8601
    return try decoder.decode(T.self, from: data)
}

// ✅ 공유 디코더
enum JSONCoders {
    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}
```

**WHY:** 매번 새 인스턴스를 생성하면 strategy 설정이 파일마다 달라질 수 있고, snake_case 변환 같은 공통 설정이 누락될 위험이 있다.

### W4. URLSession 설정을 기본값으로 방치

```swift
// ❌ 타임아웃 60초 기본값 — 느린 네트워크에서 유저가 오래 대기
let session = URLSession.shared

// ✅ 용도에 맞는 설정
let configuration = URLSessionConfiguration.default
configuration.timeoutIntervalForRequest = 15
configuration.timeoutIntervalForResource = 60
configuration.waitsForConnectivity = true
let session = URLSession(configuration: configuration)
```

**WHY:** 기본 타임아웃 60초는 모바일 환경에서 과도하다. 유저가 1분간 로딩 화면을 보고 있는 것은 나쁜 UX다.

---

## 변환 패턴

### Completion Handler → async/await

```swift
// Before
func fetchUser(id: String, completion: @escaping (Result<User, Error>) -> Void) {
    let url = baseURL.appendingPathComponent("users/\(id)")
    URLSession.shared.dataTask(with: url) { data, response, error in
        if let error {
            completion(.failure(error))
            return
        }
        guard let data else {
            completion(.failure(APIError.noData))
            return
        }
        do {
            let user = try JSONDecoder().decode(User.self, from: data)
            completion(.success(user))
        } catch {
            completion(.failure(error))
        }
    }.resume()
}

// After
func fetchUser(id: String) async throws -> User {
    let url = baseURL.appendingPathComponent("users/\(id)")
    let (data, response) = try await URLSession.shared.data(from: url)
    guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
        throw APIError.invalidResponse
    }
    return try JSONCoders.decoder.decode(User.self, from: data)
}
```

### Alamofire 콜백 → async/await

```swift
// Before
AF.request(url).responseDecodable(of: User.self) { response in
    switch response.result {
    case .success(let user):
        self.user = user
    case .failure(let error):
        self.error = error
    }
}

// After
let user = try await AF.request(url)
    .serializingDecodable(User.self)
    .value
```

### URLRequest 수동 구성 → 타입 안전 API 클라이언트

```swift
// Before — 매번 URLRequest를 수동 구성
var request = URLRequest(url: URL(string: "https://api.example.com/users")!)
request.httpMethod = "POST"
request.setValue("application/json", forHTTPHeaderField: "Content-Type")
request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
request.httpBody = try JSONEncoder().encode(body)

// After — Endpoint 타입으로 추상화
enum Endpoint {
    case getUser(id: String)
    case createUser(CreateUserRequest)
    case deleteUser(id: String)

    var path: String {
        switch self {
        case .getUser(let id): "/users/\(id)"
        case .createUser: "/users"
        case .deleteUser(let id): "/users/\(id)"
        }
    }

    var method: String {
        switch self {
        case .getUser: "GET"
        case .createUser: "POST"
        case .deleteUser: "DELETE"
        }
    }
}

// 사용
let user: User = try await apiClient.request(.getUser(id: "123"))
```

---

## 리소스

- [URLSession — Apple Developer Documentation](https://developer.apple.com/documentation/foundation/urlsession)
- [Fetching website data into memory](https://developer.apple.com/documentation/foundation/url_loading_system/fetching_website_data_into_memory)
- [WWDC21: Use async/await with URLSession](https://developer.apple.com/videos/play/wwdc2021/10095/)
- [WWDC22: Reduce networking delays for a more responsive app](https://developer.apple.com/videos/play/wwdc2022/10078/)
- [Encoding and Decoding Custom Types](https://developer.apple.com/documentation/foundation/archives_and_serialization/encoding_and_decoding_custom_types)
