# 네트워킹 규칙 — iOS

## 네트워킹 체크리스트

- [ ] 새 코드에서 URLSession의 async/await API 사용
- [ ] 모든 응답에서 HTTP 상태 코드 확인 (200-299 이외 에러 처리)
- [ ] CancellationError를 에러가 아닌 정상 흐름으로 처리
- [ ] Codable 모델에 CodingKeys가 모델 가까이에 위치
- [ ] JSONDecoder/JSONEncoder를 공유 인스턴스로 사용
- [ ] 독립적인 병렬 요청에 async let 또는 TaskGroup 사용
- [ ] API 키/시크릿이 소스 코드에 하드코딩되지 않음
- [ ] URLSession Configuration에 타임아웃 설정
- [ ] 멱등 GET 요청에 재시도 로직 적용
- [ ] View에서 직접 URLSession을 호출하지 않음 (Repository/Service 분리)

## 결정 다이어그램: API 클라이언트 설계

```
"네트워크 요청을 어떻게 구성할 것인가?"
│
├─ "단순한 1-2개 API 호출?"
│   └─→ URLSession 직접 사용
│       WHY: 추상화 오버헤드 없이 빠르게 구현. 학습 비용 제로.
│
├─ "여러 엔드포인트 + 공통 로직 (인증, 에러, 로깅)?"
│   └─→ 타입 안전 API 클라이언트 래퍼
│       WHY: Endpoint enum으로 경로/메서드/바디를 타입 수준에서 관리.
│            공통 헤더, 인증 토큰, 에러 매핑을 한 곳에서 처리.
│
├─ "복잡한 요구사항 (인터셉터, 리트라이, 멀티파트)?"
│   └─→ Alamofire 또는 유사 라이브러리
│       WHY: 인터셉터 체인, 인증 리프레시, 멀티파트 업로드 등을
│            직접 구현하면 수백 줄이 필요. 검증된 라이브러리가 안전.
│
└─ "서버가 OpenAPI/Swagger 스펙 제공?"
    └─→ 코드 생성 (swift-openapi-generator)
        WHY: 스펙에서 타입과 클라이언트를 자동 생성. 서버 변경 시 컴파일 에러로 즉시 감지.
```

## 결정 다이어그램: 에러 처리 전략

```
"네트워크 에러가 발생했다"
│
├─ CancellationError?
│   └─→ 무시 (정상 흐름)
│       WHY: 유저가 화면을 떠나거나 새 요청을 시작한 것. 에러가 아니다.
│
├─ URLError (.notConnectedToInternet, .timedOut)?
│   ├─→ 멱등 GET 요청? → 지수 백오프 재시도 (최대 3회)
│   │   WHY: 일시적 네트워크 불안정은 재시도로 해결될 수 있다.
│   └─→ POST/PUT/DELETE? → 재시도하지 않고 유저에게 알림
│       WHY: 비멱등 요청을 재시도하면 중복 처리 위험.
│
├─ HTTP 401 Unauthorized?
│   └─→ 토큰 갱신 시도 → 실패 시 로그아웃
│       WHY: 만료된 인증 토큰은 갱신으로 해결. 갱신도 실패하면 재로그인 필요.
│
├─ HTTP 429 Too Many Requests?
│   └─→ Retry-After 헤더 확인 → 대기 후 재시도
│       WHY: 서버가 명시한 대기 시간을 준수해야 차단되지 않는다.
│
├─ HTTP 4xx Client Error?
│   └─→ 유저에게 의미 있는 메시지 표시
│       WHY: 클라이언트 잘못이므로 재시도해도 동일하게 실패한다.
│
└─ HTTP 5xx Server Error?
    └─→ 재시도 (최대 2회) → 실패 시 일반 에러 메시지
        WHY: 서버 일시 장애일 수 있다. 재시도로 복구될 가능성이 있다.
```

## URLSession async/await 규칙

- 새 코드에서는 completion handler 대신 async/await를 사용한다
  - WHY: async/await는 에러 전파가 자동이고, try/catch로 모든 에러 경로를 강제한다. completion handler는 에러 경로를 호출하지 않는 실수가 가능하다.
- `URLSession.shared` 대신 용도별 Configuration을 설정한다
  - WHY: 기본 타임아웃 60초는 대부분의 모바일 사용 사례에 과도하다. 15초 내외가 적절하다.
- `waitsForConnectivity = true`를 설정하여 오프라인 시 즉시 실패 대신 대기한다
  - WHY: 지하철 등에서 순간적으로 연결이 끊겼을 때 자동으로 재연결을 기다린다.

## Codable/디코딩 규칙

- `JSONDecoder`/`JSONEncoder`는 공유 인스턴스를 사용한다
  - WHY: 매 호출마다 생성하면 strategy 설정이 중복되고, 설정 불일치 버그가 생길 수 있다.
- `keyDecodingStrategy`와 `dateDecodingStrategy`는 서버 응답 형식에 맞게 한 번만 설정한다
  - WHY: snake_case ↔ camelCase 변환을 CodingKeys 대신 전략으로 처리하면 모델 코드가 간결해진다.
- 서버 응답의 선택적 필드에는 `Optional` 타입을 사용하고 기본값을 제공한다
  - WHY: 서버 버전업으로 필드가 추가/제거될 때 디코딩 실패를 방지한다.

## 에러 처리 규칙

- 모든 네트워크 응답에서 HTTP 상태 코드를 확인한다
  - WHY: URLSession은 4xx/5xx를 에러로 throw하지 않는다. 상태 코드를 무시하면 에러 응답을 정상 데이터로 디코딩 시도한다.
- `CancellationError`와 `URLError.cancelled`는 유저에게 표시하지 않는다
  - WHY: Task 취소는 유저가 화면을 떠난 것이지 에러가 아니다. 에러 UI를 보여주면 혼란을 준다.
- 에러 타입을 앱에 맞게 정의하고 서버 에러를 매핑한다
  - WHY: URLError나 DecodingError를 그대로 유저에게 보여주면 의미를 알 수 없다.

## 캐싱 규칙

- `URLCache` 정책과 기존 캐싱 전략을 존중한다
  - WHY: URLSession은 기본적으로 HTTP 캐시 헤더를 따른다. 별도 캐싱 레이어를 추가하면 이중 캐싱이 된다.
- 이미지 등 대용량 데이터는 디스크 캐시를 사용한다
  - WHY: 메모리 캐시만 사용하면 앱 재시작 시 모든 데이터를 다시 받아야 한다.
- 캐시 무효화 전략을 명확히 한다 (TTL, ETag, Last-Modified)
  - WHY: 무효화 없는 캐시는 stale 데이터를 영원히 보여준다.

## 병렬 요청 규칙

- 독립적인 요청은 `async let`으로 병렬 실행한다
  - WHY: 순차 실행(waterfall)은 각 요청의 대기 시간이 합산된다. 3개 × 500ms = 1.5초 → 병렬이면 500ms.
- 동적 개수의 병렬 작업에는 `TaskGroup`을 사용한다
  - WHY: async let은 컴파일 타임에 개수가 고정. 배열의 각 항목을 병렬 처리하려면 TaskGroup이 필요하다.
- 병렬 요청에서 하나가 실패해도 나머지는 완료할 수 있도록 한다
  - WHY: 프로필 + 알림 + 피드를 동시에 로드할 때, 알림 실패로 전체가 실패하면 안 된다.

## 리소스

- [URLSession — Apple Developer Documentation](https://developer.apple.com/documentation/foundation/urlsession)
- [Fetching website data into memory](https://developer.apple.com/documentation/foundation/url_loading_system/fetching_website_data_into_memory)
- [WWDC21: Use async/await with URLSession](https://developer.apple.com/videos/play/wwdc2021/10095/)
- [WWDC22: Reduce networking delays for a more responsive app](https://developer.apple.com/videos/play/wwdc2022/10078/)
- [Encoding and Decoding Custom Types — Swift Documentation](https://developer.apple.com/documentation/foundation/archives_and_serialization/encoding_and_decoding_custom_types)
