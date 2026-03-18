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

## 사용법

```bash
# 프로젝트 분석만 (결과 확인)
hatchery analyze --target /path/to/project

# 온보딩 (분석 → CLAUDE.md + 스킬 문서 생성)
hatchery onboard --target /path/to/project

# 동적 컨텍스트 재생성
hatchery render --target /path/to/project --workflow add-feature
hatchery render --target /path/to/project --max-tokens 4000

# 규칙 준수 검증
hatchery audit --target /path/to/project --since HEAD~1

# 작업 기록
hatchery journal log "로그인 기능 추가"

# 커스텀 스킬 생성
hatchery skill create our-design-system
```

## 생성 파일

```
CLAUDE.md                        ← Claude Code 진입점
.hatchery/
  config.json                    ← 자동 분석 결과
  state.json                     ← 스킬·워크플로 상태
  context.md                     ← 동적 에이전트 컨텍스트
  skills/                        ← base + platform 합성 스킬
  workflows/                     ← 작업별 실행 가이드
  journal/                       ← 작업 이력
```

## 자동 감지

| 항목 | 예시 |
|---|---|
| 플랫폼 | iOS, React, Next.js, Vue, Expo |
| 모노레포 | pnpm / yarn / npm workspaces |
| 아키텍처 | MVVM, Clean Architecture (부분 매칭 포함), TCA |
| 의존성 | 네트워킹, UI, 테스트, DI, 스토리지별 분류 |
| 테스트 | 프레임워크, 파일 수, 커버리지 추정 |
| 권한 | 카메라, 위치, HealthKit 등 |
| 빌드 | xcodebuild, swift build, npm run build 등 |

## 스킬 시스템

각 스킬은 `_base.md`(공통) + `{platform}.md`(특화)를 합성한다.

빌트인: architecture, ui-rules, concurrency, networking, testing, state-management, accessibility, logging

`hatchery skill create`로 팀 전용 커스텀 스킬을 추가할 수 있다.

## 모노레포

워크스페이스를 자동 감지하고, 각각 독립된 컨텍스트를 생성한다.

```bash
hatchery render --workspace apps/patient-app
```

## 라이선스

MIT
