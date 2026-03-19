# iOS 로깅 안티패턴

심각도별로 정리한 안티패턴과 수정 방법.

## 체크리스트

| ID | 안티패턴 | 심각도 | 탐지 규칙 | 수정 방법 |
|---|---|---|---|---|
| C1 | 민감 정보 로깅 | CRITICAL | `print`/`NSLog`에 `token`, `password`, `secret`, `key` 변수 보간 | 민감 정보 제외 또는 `privacy: .private` |
| C2 | 프로덕션에서 print() | CRITICAL | `.swift` 파일에 `print(` 호출 (테스트 제외) | `os.Logger` 사용 |
| C3 | 유저 개인정보 평문 로깅 | CRITICAL | 건강·위치·연락처 데이터를 `print`/`NSLog`로 출력 | 집계 로깅 + `.private` |
| W1 | 로그 레벨 무시 | WARNING | 모든 로그가 동일 레벨 (`info`만 사용) | error/warning/info/debug 분류 |
| W2 | 과도한 로깅 | WARNING | 루프 안에서 매 반복 로깅 | 집계 로깅 (시작/완료/실패 건수) |
| W3 | subsystem·category 없음 | WARNING | `Logger()` 기본 생성자 사용 | subsystem + category 지정 |
| W4 | 에러 컨텍스트 누락 | WARNING | `logger.error("\(error)")` — 어디서 발생했는지 모름 | 작업명 + 파라미터 + 에러 메시지 |

## 목차

- C1. 민감 정보 로깅
- C2. 프로덕션에서 print() 사용
- C3. 유저 개인정보를 평문으로 로깅
- W1. 로그 레벨 무시
- W2. 과도한 로깅
- W3. subsystem·category 없이 로깅
- W4. 에러 로깅 시 컨텍스트 누락
- 변환 패턴: print → os.Logger, NSLog → os.Logger, 분산 로거 → 중앙 모듈

---

## CRITICAL — 보안·개인정보 위반

### C1. 민감 정보 로깅

```swift
// ❌ 토큰·비밀번호가 로그에 노출
func login(email: String, password: String) async throws {
    print("로그인 시도: email=\(email), password=\(password)")

    let token = try await auth.login(email: email, password: password)
    print("토큰 획득: \(token)")
}

// ✅ 민감 정보를 마스킹하거나 제외
import OSLog

private let logger = Logger(subsystem: "com.app", category: "auth")

func login(email: String, password: String) async throws {
    logger.info("로그인 시도: email=\(email, privacy: .private)")
    // password는 아예 로그하지 않음

    let token = try await auth.login(email: email, password: password)
    logger.info("토큰 획득 완료") // 토큰 값은 남기지 않음
}
```

탐지: `print`/`NSLog`에 `token`, `password`, `secret`, `key`, `credential` 변수가 보간되어 있으면.

**WHY:** 로그는 Console.app, 크래시 리포트, 디바이스 백업에 남는다. 토큰이나 비밀번호가 로그에 포함되면 디바이스 접근권만으로 계정이 탈취될 수 있다.

### C2. 프로덕션에서 print() 사용

```swift
// ❌ print는 릴리즈 빌드에서도 출력 + 구조화 안 됨 + 필터링 불가
func fetchData() async {
    print("fetchData 시작")
    let data = try? await api.fetch()
    print("fetchData 완료: \(data?.count ?? 0)건")
    print("에러 발생: \(error)") // 디바이스 콘솔에 그대로 노출
}

// ✅ os.Logger 사용 — 레벨별 필터링 + 프라이버시 제어
import OSLog

private let logger = Logger(subsystem: "com.app", category: "data")

func fetchData() async {
    logger.debug("fetchData 시작")
    do {
        let data = try await api.fetch()
        logger.info("fetchData 완료: \(data.count)건")
    } catch {
        logger.error("fetchData 실패: \(error.localizedDescription)")
    }
}
```

**WHY:** print()는 릴리즈 빌드에서도 실행되고, 레벨 분류가 없어서 필터링이 불가능하며, 프라이버시 제어가 전혀 없다. os.Logger는 이 모든 것을 지원한다.

### C3. 유저 개인정보를 평문으로 로깅

```swift
// ❌ 건강 데이터, 위치, 연락처 등이 로그에 남음
func processHealthData(_ records: [HealthRecord]) {
    for record in records {
        NSLog("건강 기록: 심박수=\(record.heartRate), 체중=\(record.weight)")
    }
}

// ✅ 개인정보는 .private, 집계 데이터만 로깅
func processHealthData(_ records: [HealthRecord]) {
    logger.info("건강 기록 처리: \(records.count)건")
    for record in records {
        logger.debug("기록 ID=\(record.id, privacy: .private)")
    }
}
```

**WHY:** 건강/위치/연락처 데이터를 평문 로깅하면 개인정보 보호법(GDPR, 개인정보보호법) 위반이 될 수 있다. `.private`으로 마스킹하거나 집계 데이터만 남겨야 한다.

---

## WARNING — 성능·유지보수 문제

### W1. 로그 레벨 무시 — 전부 같은 레벨

```swift
// ❌ 모든 로그가 같은 레벨 → 중요한 에러가 묻힘
logger.info("앱 시작")
logger.info("유저 탭: 프로필")
logger.info("네트워크 에러: \(error)")
logger.info("디코딩 실패: \(error)")
logger.info("API 응답: 200")

// ✅ 레벨별 분류
logger.info("앱 시작")            // info: 핵심 이벤트
logger.debug("유저 탭: 프로필")    // debug: 개발용 추적
logger.error("네트워크 에러: \(error.localizedDescription)") // error: 실패
logger.fault("디코딩 실패: \(error.localizedDescription)")   // fault: 심각한 버그
logger.trace("API 응답: 200")     // trace: 상세 추적
```

**WHY:** 모든 로그가 .info이면 Console.app에서 에러를 찾으려면 수천 줄을 스크롤해야 한다. 레벨별 필터링은 문제 추적의 핵심 도구다.

### W2. 과도한 로깅 — 성능 저하

```swift
// ❌ 루프 안에서 매번 로깅 → 수천 건의 로그
func processItems(_ items: [Item]) {
    for item in items {
        logger.info("처리 중: \(item.id), 이름: \(item.name)")
    }
}

// ✅ 집계 로깅
func processItems(_ items: [Item]) {
    logger.info("아이템 처리 시작: \(items.count)건")
    var failCount = 0
    for item in items {
        if !process(item) { failCount += 1 }
    }
    logger.info("아이템 처리 완료: 성공 \(items.count - failCount)건, 실패 \(failCount)건")
}
```

**WHY:** 루프에서 매 반복 로깅하면 수천 건의 디스크 I/O가 발생한다. 집계(시작/완료/실패 건수)로 같은 정보를 1-2줄로 전달할 수 있다.

### W3. subsystem·category 없이 로깅

```swift
// ❌ 기본 Logger — 모듈 구분 불가
let logger = Logger()
logger.info("데이터 로드 완료")
// Console.app에서 앱의 수백 개 로그가 뒤섞임

// ✅ subsystem + category로 분류
enum Loggers {
    static let networking = Logger(subsystem: "com.myapp", category: "networking")
    static let auth = Logger(subsystem: "com.myapp", category: "auth")
    static let ui = Logger(subsystem: "com.myapp", category: "ui")
    static let storage = Logger(subsystem: "com.myapp", category: "storage")
}

Loggers.networking.info("API 호출: GET /users")
Loggers.auth.info("로그인 성공")
```

**WHY:** subsystem과 category가 없으면 Console.app에서 앱 로그를 시스템 로그와 구분할 수 없다. 네트워킹 문제를 추적하려면 category로 필터링해야 한다.

### W4. 에러 로깅 시 컨텍스트 누락

```swift
// ❌ 에러만 덩그러니 — 어디서 왜 발생했는지 모름
logger.error("\(error)")

// ✅ 컨텍스트 포함
logger.error("유저 프로필 로드 실패 [userId=\(userId, privacy: .private)]: \(error.localizedDescription)")
```

**WHY:** `logger.error("\(error)")`만으로는 어떤 함수에서 어떤 파라미터로 실패했는지 알 수 없다. 작업명과 입력값을 포함해야 재현할 수 있다.

---

## 변환 패턴

### print → os.Logger

```swift
// Before
print("API 응답: \(statusCode)")
print("에러: \(error)")
debugPrint(response)

// After
import OSLog

private let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.app", category: "networking")

logger.info("API 응답: \(statusCode)")
logger.error("에러: \(error.localizedDescription)")
logger.debug("응답 상세: \(String(describing: response), privacy: .private)")
```

### NSLog → os.Logger

```swift
// Before — Objective-C 스타일, 느림
NSLog("유저 로그인: %@", userId)
NSLog("에러 발생: %@", error.localizedDescription)

// After — Swift 네이티브, 빠름
logger.info("유저 로그인: \(userId, privacy: .private)")
logger.error("에러 발생: \(error.localizedDescription)")
```

NSLog vs os.Logger:

| | NSLog | os.Logger |
|---|---|---|
| 속도 | 느림 (동기) | 빠름 (비동기) |
| 프라이버시 | 없음 | `.private`, `.public` |
| 레벨 | 없음 | debug/info/error/fault |
| 필터링 | 불가 | subsystem + category |
| 포맷 | `%@` printf 스타일 | Swift 문자열 보간 |

### 분산된 로거 → 중앙화 로거 모듈

```swift
// Before — 파일마다 Logger를 각각 생성
// UserService.swift
let logger = Logger(subsystem: "com.app", category: "user")
// CartService.swift
let logger = Logger(subsystem: "com.app", category: "cart")
// subsystem 오타 → 로그 필터링 실패

// After — 중앙 모듈에서 관리
enum Log {
    private static let subsystem = Bundle.main.bundleIdentifier ?? "com.app"

    static let auth = Logger(subsystem: subsystem, category: "auth")
    static let network = Logger(subsystem: subsystem, category: "network")
    static let storage = Logger(subsystem: subsystem, category: "storage")
    static let ui = Logger(subsystem: subsystem, category: "ui")
}

// 사용
Log.auth.info("로그인 성공")
Log.network.error("요청 실패: \(error.localizedDescription)")
```

---

## 리소스

- [os.Logger — Apple Developer Documentation](https://developer.apple.com/documentation/os/logger)
- [Generating log messages from your code](https://developer.apple.com/documentation/os/logging/generating_log_messages_from_your_code)
- [WWDC20: Explore logging in Swift](https://developer.apple.com/videos/play/wwdc2020/10168/)
- [WWDC18: Measuring Performance Using Logging](https://developer.apple.com/videos/play/wwdc2018/405/)
