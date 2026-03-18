# 아키텍처 규칙 — iOS

## iOS 특화 가이드

- Swift 접근 제어(`internal`, `private`, `public`)를 모듈 경계에서 의도적으로 사용한다.
- 프로젝트가 지원하면 Swift Package 모듈로 기능을 분리한다.
- `@MainActor`는 ViewModel/Presenter 레벨에 두고, 도메인 레이어에 흩뿌리지 않는다.
- 레이어 간 계약에는 프로토콜을 사용한다(기존 패턴을 따른다).
- 레이어 간 데이터 전달에는 값 타입(struct, enum)을 선호한다.
- AppDelegate / SceneDelegate는 얇게 유지하고, coordinator나 router에 위임한다.
