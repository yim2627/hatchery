# 접근성 규칙 — iOS

- 커스텀 컨트롤에 `.accessibilityLabel`, `.accessibilityHint`, `.accessibilityValue`를 사용한다.
- 관련 요소는 `.accessibilityElement(children: .combine)`로 그룹화한다.
- `.accessibilitySortPriority`로 VoiceOver 탐색 순서를 관리한다.
- Dynamic Type를 존중한다 — 하드코딩된 폰트 크기를 피한다.
- VoiceOver와 Accessibility Inspector로 테스트한다.
