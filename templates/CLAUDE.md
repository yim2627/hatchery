# {{PROJECT_NAME}}

## 프로젝트 컨텍스트

- 플랫폼: {{PLATFORMS}}
- 아키텍처: {{ARCHITECTURE_STYLE}}
- UI: {{UI_FRAMEWORK}}
- 네트워킹: {{NETWORK_LAYER_NAME}}
- 저장소: {{PERSISTENCE_LAYER_NAME}}
- 로깅: {{LOGGING_SYSTEM}}
- 테스트: {{TEST_FRAMEWORK}}
- 패키지 매니저: {{PACKAGE_MANAGER}}
- 프로젝트 생성: {{PROJECT_GENERATOR}}
- 린트: {{LINT_TOOLS}}

## 디렉토리 구조

```
{{DIRECTORY_TREE}}
```

## 작업 전 확인

- 관련 코드를 먼저 읽는다.
- 명확한 요청은 바로 구현한다. 모호하거나 위험한 요청만 계획을 먼저 세운다.
- diff를 최소화하고 리뷰 가능하게 유지한다.
- 완료 전에 검증을 실행하거나 설명한다.

## 빌드·테스트

```
빌드: {{BUILD_COMMAND}}
테스트: {{TEST_COMMAND}}
```

## 규칙

`.hatchery/skills/`의 스킬 문서를 따른다. 현재 활성 스킬:

{{SELECTED_SKILLS_BULLETS}}

작업 유형별 워크플로가 `.hatchery/workflows/`에 있다. 작업이 매칭되면 해당 워크플로를 참조한다.

## 금지 패턴

- 작업과 무관한 리팩토링
- 죽은 코드, 주석 처리된 코드
- 가짜 플레이스홀더를 완성된 구현으로 제시
- 시크릿 하드코딩
- UI 코드에서 직접 네트워킹/저장소 접근

## 완료 시

- 변경된 파일 요약
- 동작 영향 요약
- 실행한 테스트 또는 미실행 사유
- 리스크·제한사항
