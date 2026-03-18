# 아키텍처 규칙 — Web

## Web 특화 가이드

- 기존 라우팅 구조(App Router, Pages Router, 파일 기반 라우팅 등)를 존중한다.
- 프레임워크가 지원하면 서버/클라이언트 경계를 명확히 한다 (예: `"use client"` / `"use server"`).
- 프로젝트가 컴포넌트 + 테스트 + 스타일 + 타입 코로케이션 패턴을 따르면 그대로 유지한다.
- Props drilling이 2단계를 넘으면 context, 합성, 또는 상태 관리 라이브러리를 사용한다.
- API route handler는 얇게 유지하고, service/domain 모듈에 위임한다.
- 프레임워크가 허용하면 데이터 페칭과 렌더링을 분리한다.
- barrel export(`index.ts`)는 의도적으로만 사용한다.
