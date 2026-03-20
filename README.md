# 🥚 Hatchery

코드베이스를 읽고, AI 에이전트가 일할 환경을 자동으로 만들어주는 CLI 도구.

프로젝트를 분석해서 플랫폼·아키텍처·의존성·테스트 현황을 파악하고,
그 결과를 바탕으로 Claude Code가 바로 쓸 수 있는 `CLAUDE.md`와 스킬 문서를 생성한다.

## 왜 만들었나

- AI 에이전트한테 "우리 프로젝트는 MVVM이고, Moya 쓰고, 테스트 커버리지 낮아"라고 매번 설명하기 귀찮다.
- 프로젝트마다 규칙을 수동으로 복사하면 틀리고, 빠뜨리고, 낡아진다.
- 에이전트가 작업한 결과가 우리 규칙을 따르는지 확인할 방법이 없다.
- 지난번에 에이전트한테 뭘 시켰는지 기억이 안 난다.

Hatchery는 이 네 가지를 자동화한다.

## 핵심 아이디어

```
코드 분석 → 컨텍스트 생성 → 에이전트 작업 → 검증 → 기록
    ↑                                              │
    └──────────────────────────────────────────────┘
```

**코드가 말해준다.**
프로젝트를 스캔해서 플랫폼, 아키텍처, 의존성, 테스트 현황, 빌드 명령을 자동으로 파악한다. 사람이 설정 파일을 채우는 게 아니라 코드가 설정을 결정한다.

**컨텍스트는 동적이다.**
전체 규칙을 통째로 덤프하지 않는다. 지금 하려는 작업과 최근 변경된 파일에 따라 필요한 스킬과 규칙만 골라서 컨텍스트를 조합한다.

**결과를 검증한다.**
에이전트가 작업한 결과물이 프로젝트 규칙을 따르는지 휴리스틱으로 검증한다.

**이력을 남긴다.**
어떤 작업을 시켰고, 뭐가 바뀌었는지 기록해서 다음 세션의 컨텍스트로 넘길 수 있다.

## 설치

```bash
npm install -g @limjiseong/hatchery
```

## 빠른 시작

```bash
# 1. 프로젝트 온보딩 (최초 1회)
hatchery onboard --target /path/to/project

# 2. Claude Code로 작업
# (생성된 CLAUDE.md가 에이전트에게 프로젝트 컨텍스트를 제공)

# 3. 작업 후 규칙 준수 검증
hatchery audit --target /path/to/project

# 4. 코드 변경 후 config만 갱신
hatchery sync --target /path/to/project
```

## 커맨드

### `analyze` — 프로젝트 분석

파일을 생성하지 않고 분석 결과만 출력한다. 온보딩 전 확인용.

> 시나리오: 새 프로젝트를 인수받았다. 온보딩 전에 Hatchery가 뭘 감지하는지 먼저 확인하고 싶다.

```bash
hatchery analyze --target /path/to/project
```

출력 예시:
```
감지된 플랫폼: ios (100%)
아키텍처 추정: MVVM + Repository
추천 프로필: intermediate
추천 스킬: architecture, ui-rules, concurrency, networking, testing, state-management
```

### `onboard` — 온보딩

프로젝트를 분석하고 `CLAUDE.md`, 스킬 문서, 워크플로를 생성한다.

> 시나리오: 프로젝트에 처음 Hatchery를 적용한다. 실행하면 `CLAUDE.md`와 `.hatchery/` 디렉토리가 생성되고, Claude Code가 바로 프로젝트 규칙을 이해할 수 있게 된다.

```bash
hatchery onboard --target /path/to/project
hatchery onboard --target /path/to/project --profile advanced
hatchery onboard --target /path/to/project --skills "architecture,testing" --platform "ios"
hatchery onboard --target /path/to/project --non-interactive --force
```

| 옵션 | 설명 |
|---|---|
| `--target` | 대상 프로젝트 경로 (기본: 현재 디렉토리) |
| `--profile` | 프로필 지정 (`basic` / `intermediate` / `advanced`) |
| `--skills` | 스킬 목록 직접 지정 (쉼표 구분) |
| `--workflows` | 워크플로 목록 직접 지정 (쉼표 구분) |
| `--platform` | 플랫폼 직접 지정 (쉼표 구분) |
| `--non-interactive` | 대화 없이 자동 진행 |
| `--force` | 기존 설정 덮어쓰기 |

### `sync` — 설정 동기화

프로젝트를 재분석하여 `config.json`만 갱신한다. 스킬, 워크플로, `CLAUDE.md`는 건드리지 않는다.

> 시나리오: CoreData에서 SwiftData로 마이그레이션했다. `sync`를 실행하면 `persistence_layer_name`이 자동으로 업데이트되고, 이후 `render` 시 SwiftData 규칙이 적용된다.

```bash
hatchery sync --target /path/to/project
hatchery sync --target /path/to/project --workspace apps/patient-app
```

변경된 필드가 있으면 diff를 출력한다:
```
변경된 필드 (2개):

  persistence_layer_name
    - CoreData
    + SwiftData
  architecture_style
    - MVC
    + MVVM + Repository
```

### `render` — 동적 컨텍스트 생성

현재 상태와 작업 목적에 맞춰 에이전트 컨텍스트를 재생성한다.

> 시나리오: Claude Code에게 "로그인 기능 추가해줘"라고 시키려 한다. `render --workflow add-feature`를 실행하면, add-feature 워크플로와 관련 스킬(architecture, networking 등)을 중심으로 최적화된 컨텍스트가 `.hatchery/context.md`에 생성된다. 토큰 예산 안에서 지금 작업에 필요한 규칙만 들어간다.

```bash
hatchery render --target /path/to/project
hatchery render --target /path/to/project --workflow add-feature
hatchery render --target /path/to/project --max-tokens 4000
hatchery render --target /path/to/project --journal 5
hatchery render --target /path/to/project --workspace apps/web
```

| 옵션 | 설명 |
|---|---|
| `--workflow` | 특정 워크플로에 집중한 컨텍스트 생성 |
| `--max-tokens` | 토큰 예산 제한 |
| `--journal` | 최근 N개 작업 이력 포함 |
| `--workspace` | 모노레포 워크스페이스 경로 |

### `audit` — 규칙 준수 검증

활성 스킬의 규칙을 기준으로 코드를 검사한다.

> 시나리오: Claude Code가 새 화면 3개를 만들었다. `audit`을 실행하면 View에서 직접 네트워킹하는 코드, `@MainActor` 누락 등 프로젝트 규칙 위반을 자동으로 잡아준다. `--since HEAD~1`로 방금 커밋한 변경만 검사할 수도 있다.

```bash
hatchery audit --target /path/to/project
hatchery audit --target /path/to/project --since HEAD~3
```

| 옵션 | 설명 |
|---|---|
| `--since` | Git ref 이후 변경된 파일만 검사 (예: `HEAD~1`, `main`) |

출력 예시:
```
ERROR (2개):
  Sources/Model/Item.swift:12 — SwiftData @Model 클래스는 @MainActor 격리를 권장합니다.
  Sources/Service/API.swift:45 — async 컨텍스트에서 세마포어 사용은 데드락을 유발합니다.

WARNING (3개):
  Sources/View/HomeView.swift:89 — Force unwrap(!) 사용을 최소화하세요.
  ...

검사 파일: 248개, 통과: 19개, 위반: 5개
```

감지 가능한 규칙:

| 카테고리 | 규칙 예시 |
|---|---|
| architecture | View에서 직접 네트워킹, 하드코딩 시크릿, URL에 API 키 포함 |
| concurrency | `Task.detached` 남용, 세마포어 데드락, `DispatchGroup` 레거시 |
| testing | force unwrap, force try |
| ui-rules | `ObservableObject` → `@Observable` 마이그레이션, `NavigationView` deprecated |
| networking | 하드코딩 URL |
| logging | `NSLog` → OSLog |
| state-management | SwiftData `@MainActor` 누락, `ModelContext` 백그라운드 사용, predicate 없는 fetch 등 7개 |

### `spec` — 기획서/스펙 문서 관리

프로젝트 기획서, PRD, 설계 문서를 등록하여 에이전트 컨텍스트에 자동 포함시킨다.

> 시나리오: PM이 기획서를 줬다. `spec add`로 등록하면, `render` 시 context.md에 기획서 전문이 번들링되고 CLAUDE.md에 참조가 추가된다. 에이전트가 기획 맥락을 파악한 상태로 작업을 시작한다.

```bash
# 기획서 등록
hatchery spec add ./PRD.md --target /path/to/project

# 등록된 스펙 목록
hatchery spec list --target /path/to/project

# 스펙 제거
hatchery spec remove PRD.md --target /path/to/project

# context.md + CLAUDE.md에 반영
hatchery render --target /path/to/project
```

### `skill` — 스킬 관리

```bash
# 사용 가능한 스킬 목록
hatchery skill list --target /path/to/project

# 커스텀 스킬 생성
hatchery skill create our-design-system --target /path/to/project
```

### `workflow` — 워크플로 관리

```bash
# 워크플로 목록
hatchery workflow list --target /path/to/project

# 워크플로 내용 출력
hatchery workflow print add-feature --target /path/to/project

# 추가 워크플로 활성화
hatchery workflow scaffold deploy monitoring --target /path/to/project
```

### `journal` — 작업 이력

에이전트 작업 이력을 기록하고 다음 세션의 컨텍스트로 활용한다.

> 시나리오: 오늘 Claude Code로 로그인 기능을 만들었다. `journal log`로 기록해두면, 내일 새 세션에서 `render --journal 3`으로 최근 작업 맥락을 컨텍스트에 포함시킬 수 있다. "어제 뭐 했더라?"를 에이전트가 알게 된다.

```bash
# 작업 기록
hatchery journal log "로그인 기능 추가" --target /path/to/project
hatchery journal log "API 에러 핸들링 개선" --files "Sources/API.swift,Sources/Error.swift"

# 이력 조회
hatchery journal list --target /path/to/project
hatchery journal show <id> --target /path/to/project

# 에이전트 컨텍스트로 출력
hatchery journal context --target /path/to/project
```

## 생성 파일

```
CLAUDE.md                        ← Claude Code 진입점
.hatchery/
  config.json                    ← 자동 분석 결과 (프로젝트 메타데이터)
  state.json                     ← 온보딩 상태 (프로필, 스킬, 플랫폼)
  context.md                     ← 동적 에이전트 컨텍스트
  specs/                         ← 기획서/PRD/설계 문서
  skills/                        ← base + platform 합성 스킬
  workflows/                     ← 작업별 실행 가이드
  journal/                       ← 작업 이력
```

### config.json 예시

```json
{
  "project_name": "MyApp",
  "platforms": ["ios"],
  "ui_framework": "SwiftUI",
  "architecture_style": "MVVM + Repository",
  "min_version": "iOS 17.0",
  "package_manager": "Swift Package Manager",
  "project_generator": "Xcode",
  "test_framework": "Swift Testing",
  "lint_tools": "SwiftLint",
  "network_layer_name": "Moya",
  "persistence_layer_name": "SwiftData",
  "logging_system": "OSLog",
  "build_command": "xcodebuild -scheme MyApp build",
  "test_command": "xcodebuild test -scheme MyApp"
}
```

## 자동 감지

| 항목 | 예시 |
|---|---|
| 플랫폼 | iOS, React, Next.js, Vue, Expo |
| 모노레포 | pnpm / yarn / npm workspaces |
| 아키텍처 | MVVM, Clean Architecture (부분 매칭 포함), TCA, ReactorKit |
| UI 프레임워크 | SwiftUI, UIKit, 혼합 비율 감지 (예: `UIKit (SwiftUI 부분 적용)`) |
| 프로젝트 생성 | Tuist, XcodeGen, Bazel, Vite, Next.js, Xcode |
| 의존성 | 네트워킹, UI, 테스트, DI, 스토리지별 분류 |
| 테스트 | 프레임워크, 파일 수, 커버리지 추정 |
| 저장소 | SwiftData, CoreData, Realm, GRDB 등 (퍼스트파티 포함) |
| 권한 | 카메라, 위치, HealthKit 등 |
| 빌드 | xcodebuild, swift build, npm run build 등 |

## 프로필

프로젝트 복잡도에 따라 3단계 프로필을 제공한다. 분석 결과에 따라 자동 추천되며, `--profile`로 직접 지정할 수도 있다.

| 프로필 | 대상 | 기본 스킬 | 주요 특징 |
|---|---|---|---|
| **basic** | 개인 프로젝트, MVP | architecture, ui-rules, testing | 간결한 구현 우선, 최소 프로세스 |
| **intermediate** | 프로덕트 개발 | + concurrency, networking | 셀프 리뷰, 회귀 테스트, 상태 전이 리스크 |
| **advanced** | 복잡한 앱, 장기 운영 | + state-management, logging | 리스크 요약, 성능 가이드, 전체 스킬 활성화 |

## 스킬 시스템

각 스킬은 `_base.md`(공통) + `{platform}.md`(특화)를 합성한다.

### 빌트인 스킬

| 스킬 | 설명 | 플랫폼 |
|---|---|---|
| **architecture** | 레이어 분리, 의존성 방향, 디자인 패턴 | iOS, Web |
| **ui-rules** | UI 컴포넌트 규칙, Property Wrapper 선택, 네비게이션 | iOS, Web |
| **concurrency** | 비동기 처리, actor 격리, 데드락 방지 | iOS, Web |
| **networking** | API 클라이언트 설계, 에러 처리, 인증 | iOS, Web |
| **testing** | 테스트 전략, 모킹, 커버리지 | iOS, Web |
| **state-management** | 상태 관리 패턴, SwiftData/CoreData, 전역 상태 | iOS, Web |
| **accessibility** | 접근성 규칙, VoiceOver, Dynamic Type | iOS, Web |
| **logging** | 로깅 전략, OSLog, 구조화 로깅 | iOS, Web |

각 스킬은 `references/` 디렉토리에 패턴·안티패턴 레퍼런스를 포함한다.

`hatchery skill create`로 팀 전용 커스텀 스킬을 추가할 수 있다.

## 워크플로

작업 유형별 실행 가이드를 제공한다. `render --workflow`로 해당 워크플로에 집중한 컨텍스트를 생성할 수 있다.

| 워크플로 | 설명 |
|---|---|
| **add-feature** | 새 기능 추가 |
| **fix-bug** | 버그 수정 |
| **refactor** | 코드 리팩토링 |
| **review** | 코드 리뷰 |
| **build** | 빌드 및 배포 |
| **verify** | 검증 및 테스트 |

## 모노레포

워크스페이스를 자동 감지하고, 각각 독립된 컨텍스트를 생성한다.

```bash
hatchery onboard --target /path/to/monorepo
hatchery render --workspace apps/patient-app
hatchery sync --workspace apps/web
```

## 지원 플랫폼

- iOS (SwiftUI / UIKit)
- React
- Next.js
- Vue
- Expo / React Native

> Android는 현재 지원하지 않는다.

## 라이선스

MIT
