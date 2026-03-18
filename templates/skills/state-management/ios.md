# 상태 관리 규칙 — iOS

- View 상태에는 `@Observable`(iOS 17+) 또는 `ObservableObject`를 사용한다.
- `@Published` / `@State` 프로퍼티는 최소화하고, 파생 가능한 것은 computed로 처리한다.
- source of truth에서 계산 가능한 파생 상태를 별도 저장하지 않는다.
- 상호 배타적인 UI 상태에는 enum을 사용한다(loading/success/error).
- UI를 구동하는 모든 상태 변경에 `@MainActor` 격리를 준수한다.
- 영속 상태가 필요하면 `@AppStorage` / `@SceneStorage`를 검토한다.
