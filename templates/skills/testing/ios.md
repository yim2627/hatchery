# 테스트 규칙 — iOS

- 프로젝트에서 확립된 테스트 프레임워크(XCTest 또는 Swift Testing)를 사용한다.
- ViewModel/Presenter를 결정적 입력으로 테스트한다.
- 의존성에는 프로토콜 기반 mock이나 fake를 사용한다.
- 비동기 테스트에는 `async/await` 테스트 메서드 또는 `XCTestExpectation`을 사용한다.
- happy path뿐 아니라 에러 경로와 엣지 상태도 테스트한다.
- UI 격리 상태를 다루는 테스트에서는 `@MainActor`를 사용한다.
