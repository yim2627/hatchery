# Hatchery 개발 가이드

멀티 플랫폼 AI 에이전트 하네스 생성 CLI 도구. TypeScript/Node.js.

## 빌드·실행

```
npm install
npm run build
node dist/bin/hatchery.js --help
```

## 테스트 실행 (실제 프로젝트 대상)

```
node dist/bin/hatchery.js analyze --target /path/to/ios-project
node dist/bin/hatchery.js onboard --target /path/to/ios-project --non-interactive
node dist/bin/hatchery.js audit --target /path/to/ios-project
node dist/bin/hatchery.js render --target /path/to/ios-project --workflow add-feature
```

## 구조

- `bin/hatchery.ts` — CLI 엔트리포인트 (Commander.js)
- `src/analyzer/` — 플랫폼 감지 + iOS/Web 스캐너 + 디렉토리 트리 생성
- `src/generator/` — 템플릿 렌더링, 스킬 합성(base+platform), 선택적 컨텍스트 빌더
- `src/auditor/` — 활성 스킬 기반 휴리스틱 규칙 검증
- `src/state/` — .hatchery/state.json 관리
- `src/journal/` — Task Journal (작업 이력)
- `src/cli/commands/` — 8개 서브커맨드 (onboard, analyze, render, upgrade, audit, skill, workflow, journal)
- `templates/` — CLAUDE.md 템플릿, 스킬(base+ios+web), 워크플로, 레퍼런스
- `profiles/` — basic/intermediate/advanced YAML

## 변경 시 규칙

- CHANGELOG.md에 변경 사항을 기록한다.
- 스킬 템플릿은 한글로 작성한다.
- Android는 지원하지 않는다 (iOS + Web만).
- 새 기능 추가 시 빌드 + 테스트 프로젝트 대상 실행으로 검증한다.

## 현재 버전: v0.1.7

자세한 이력은 CHANGELOG.md 참고.

## 다음 할 것

- 나머지 스킬 레퍼런스 채우기 (networking, testing, state-management, logging, accessibility)
- `hatchery sync` — 코드 변경 시 config.json 자동 업데이트
- Web 프로젝트 대상 테스트
- 모노레포 대상 테스트
- render --workflow의 스킬 필터링 더 공격적으로 줄이기
