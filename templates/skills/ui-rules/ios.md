# UI 규칙 — iOS (SwiftUI)

- View는 `body`를 통해 UI를 기술하는 데 집중한다.
- `body` 안에 무거운 로직을 직접 넣지 않는다.
- 복잡도가 의미 있게 줄어들 때만 서브뷰를 추출한다.
- iOS 17+이면 `ObservableObject`보다 `@Observable`을 우선 검토한다.
- `@State`, `@Binding`, `@Environment`, `@Bindable`을 의도적으로 구분해서 사용한다.
- 기존 네비게이션 패턴(`NavigationStack`, coordinator 등)을 유지한다.
- 리렌더링으로 인한 반복 사이드 이펙트를 피한다.
- 상태 업데이트는 `@MainActor` 격리를 준수한다.
