# {{PROJECT_NAME}} — AI 에이전트 지침서

## 프로젝트 맥락

플랫폼: {{PLATFORMS}} | 아키텍처: {{ARCHITECTURE_STYLE}} | UI: {{UI_FRAMEWORK}}
저장소: {{PERSISTENCE_LAYER_NAME}} | 네트워킹: {{NETWORK_LAYER_NAME}} | 테스트: {{TEST_FRAMEWORK}}
패키지: {{PACKAGE_MANAGER}} | 린트: {{LINT_TOOLS}} | 최소 버전: {{MIN_VERSION}}

## 필독

작업 전 아래 순서로 읽는다:

1. 작업과 관련된 스킬 문서를 읽는다:
{{SKILL_DESCRIPTIONS}}

{{SPEC_SECTION}}작업이 아래에 매칭되면 해당 절차를 따른다:

{{WORKFLOW_INLINE}}

## 빌드·테스트

빌드: {{BUILD_COMMAND}}
테스트: {{TEST_COMMAND}}

## 기대 효과

모든 작업은 다음을 만족해야 한다:
- {{ARCHITECTURE_STYLE}} 패턴을 유지하며 레이어 경계를 넘지 않는다
- 변경 범위를 최소화하고 리뷰 가능한 diff를 만든다
- 빌드가 깨지지 않으며, 비자명한 로직에는 테스트를 추가한다
- 시크릿 하드코딩, View에서 직접 네트워킹/저장소 접근을 하지 않는다

## 완료 기준

- 빌드·테스트를 실행하고 결과를 공유한다
- 변경이 영향을 주는 화면·기능 범위를 설명한다
- 새 의존성을 추가했다면 사유를 밝힌다
- 리스크나 후속 작업이 있으면 명시한다

{{PROFILE_GUIDANCE}}
