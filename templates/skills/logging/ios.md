# 로깅 규칙 — iOS

## OSLog 체크리스트

- [ ] 모든 로깅에 `os.Logger` 사용 (print/NSLog 금지)
- [ ] 각 Logger에 subsystem + category 지정
- [ ] 민감한 데이터(토큰, 비밀번호, 개인정보)에 `.private` 적용
- [ ] 로그 레벨을 목적에 맞게 분류 (debug/info/error/fault)
- [ ] 루프 안에서 매 반복 로깅하지 않음 (집계 로깅)
- [ ] 에러 로깅 시 컨텍스트 포함 (작업명 + 파라미터 + 에러)
- [ ] 중앙 로거 모듈로 subsystem 오타 방지
- [ ] 릴리즈 빌드에서 debug 레벨 로그가 성능에 영향 없음 확인

## 결정 다이어그램: 로그 레벨 선택

```
"이 로그의 목적은 무엇인가?"
│
├─ "개발 중 디버깅용 (릴리즈에서 불필요)"
│   └─→ .debug
│       WHY: 릴리즈 빌드에서 자동으로 제거된다. 성능 영향 제로.
│
├─ "앱의 정상 동작 흐름 기록"
│   └─→ .info
│       WHY: 메모리에만 저장. 문제가 발생하면 Console.app에서 확인 가능.
│
├─ "주목할 만한 이벤트 (디스크에 저장 필요)"
│   └─→ .notice (또는 .log)
│       WHY: 디스크에 영구 저장. 크래시 리포트 분석 시 확인 가능.
│
├─ "복구 가능한 에러"
│   └─→ .error
│       WHY: 디스크 저장 + Console에서 빨간색으로 강조. 에러 추적에 필수.
│
└─ "복구 불가능한 심각한 버그"
    └─→ .fault
        WHY: 시스템 수준 로그로 기록. 앱이 크래시하기 직전의 상태를 남겨야 할 때.
```

## 결정 다이어그램: 프라이버시 레벨 선택

```
"이 데이터를 로그에 어떻게 남길 것인가?"
│
├─ "식별 불가능한 일반 데이터 (상태 코드, 항목 수, 기능명)"
│   └─→ .public (또는 생략 — 숫자/Bool은 기본 public)
│       WHY: Console.app에서 바로 확인 가능. 디버깅 효율.
│
├─ "유저를 식별할 수 있는 데이터 (이메일, userId, 디바이스ID)"
│   └─→ .private
│       WHY: 디바이스에서는 <private>으로 표시. 개발자 디바이스에서만 원본 확인.
│
├─ "토큰, 비밀번호, 건강 데이터, 금융 정보"
│   └─→ 로그하지 않는다
│       WHY: .private도 개발자 디바이스에서는 볼 수 있다. 민감 데이터는 아예 남기지 않는 것이 안전.
│
└─ "디버깅에 필요하지만 민감한 데이터"
    └─→ .private(mask: .hash)
        WHY: 해시값으로 동일성만 확인. 같은 유저의 요청을 추적하되 원본은 노출하지 않음.
```

## os.Logger 기본 설정 규칙

- `Logger(subsystem:category:)`로 생성하고 subsystem은 Bundle ID를 사용한다
  - WHY: Console.app에서 subsystem으로 앱의 로그만 필터링할 수 있다.
- category는 기능 도메인별로 분류한다 (auth, networking, storage, ui)
  - WHY: 네트워킹 문제를 추적할 때 networking 카테고리만 켜면 된다.
- 기본 `Logger()` 생성자를 사용하지 않는다
  - WHY: subsystem과 category가 없으면 다른 앱/시스템 로그와 섞여 필터링 불가.

## 로그 레벨 규칙

- 모든 로그가 같은 레벨(.info만)인 상태를 피한다
  - WHY: 에러와 디버깅 정보가 같은 레벨이면 중요한 에러가 노이즈에 묻힌다.
- 에러에는 `.error`, 심각한 버그에는 `.fault`를 사용한다
  - WHY: Console.app에서 에러 레벨 이상만 필터링하여 문제를 빠르게 찾을 수 있다.
- 개발용 추적 로그에는 `.debug`를 사용한다
  - WHY: 릴리즈 빌드에서 자동 제거되므로 성능 영향이 없다.

## 프라이버시 규칙

- 숫자와 Bool은 기본 public이지만, 문자열은 기본 private이다
  - WHY: Apple이 의도적으로 설계한 것. 문자열에 개인정보가 포함될 가능성이 높기 때문.
- 공개해도 되는 문자열에는 명시적으로 `.public`을 사용한다
  - WHY: 기본이 private이므로 Console.app에서 <private>으로 표시되어 디버깅이 어려워진다.
- 토큰, 비밀번호, 건강/금융 데이터는 아예 로그하지 않는다
  - WHY: `.private`도 개발자 디바이스에서는 원본이 보인다. 로그 파일이 유출되면 위험하다.

## 성능 규칙

- 루프 안에서 매 반복 로깅하지 않는다
  - WHY: 수천 건의 로그는 디스크 I/O와 메모리를 소모한다. 집계(시작/완료/실패 건수)로 충분하다.
- OSLog의 문자열 보간은 lazy 평가된다
  - WHY: `logger.debug("data: \(expensive())")` — debug 레벨이 비활성화되면 expensive()는 호출되지 않는다.
- 릴리즈 빌드에서 debug 레벨 로그의 보간 비용을 걱정하지 않아도 된다
  - WHY: 컴파일러가 debug 레벨 로그를 최적화하여 제거한다.

## 중앙화 로거 규칙

- 앱 전체의 Logger 인스턴스를 하나의 enum/struct에서 관리한다
  - WHY: 파일마다 Logger를 생성하면 subsystem 오타가 발생하고, 카테고리 네이밍이 불일치한다.
- 로거 모듈에서 subsystem을 `Bundle.main.bundleIdentifier`로 통일한다
  - WHY: 하드코딩된 문자열은 앱 이름 변경 시 수동 업데이트가 필요하다.

## 리소스

- [os.Logger — Apple Developer Documentation](https://developer.apple.com/documentation/os/logger)
- [Generating log messages from your code](https://developer.apple.com/documentation/os/logging/generating_log_messages_from_your_code)
- [WWDC20: Explore logging in Swift](https://developer.apple.com/videos/play/wwdc2020/10168/)
- [WWDC18: Measuring Performance Using Logging](https://developer.apple.com/videos/play/wwdc2018/405/)
