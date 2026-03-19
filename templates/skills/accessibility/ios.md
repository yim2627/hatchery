# 접근성 규칙 — iOS

## SwiftUI 접근성 체크리스트

- [ ] 모든 인터랙티브 요소(버튼, 토글, 링크)에 `.accessibilityLabel` 설정
- [ ] 정보성 이미지에 설명 추가, 장식용 이미지는 `.accessibilityHidden(true)`
- [ ] 터치 타겟 최소 44x44pt 확보
- [ ] 하드코딩 폰트 크기 없이 Dynamic Type 텍스트 스타일 사용
- [ ] 색상만으로 정보를 전달하지 않음 (아이콘 + 텍스트 병행)
- [ ] 관련 요소를 `.accessibilityElement(children: .combine)`로 그룹화
- [ ] ZStack에서 `.accessibilitySortPriority`로 탐색 순서 관리
- [ ] 비동기 상태 변경 시 `AccessibilityNotification`으로 VoiceOver에 공지
- [ ] 커스텀 컨트롤(onTapGesture)에 `.accessibilityAddTraits(.isButton)` 추가
- [ ] VoiceOver + Accessibility Inspector로 테스트

## 결정 다이어그램: 접근성 수정자 선택

```
"이 요소에 어떤 접근성 수정자가 필요한가?"
│
├─ "VoiceOver가 이 요소를 뭐라고 읽어야 하는가?"
│   └─→ .accessibilityLabel("설명")
│       WHY: 아이콘 버튼 등 시각적 요소를 텍스트로 설명. VoiceOver의 기본 읽기.
│
├─ "이 요소의 추가 설명이 필요한가? (탭하면 무슨 일이 일어나는지)"
│   └─→ .accessibilityHint("힌트")
│       WHY: label 후 잠깐 멈추면 읽어준다. 동작의 결과를 설명.
│
├─ "이 요소의 현재 상태/값이 있는가? (슬라이더, 토글)"
│   └─→ .accessibilityValue("값")
│       WHY: 현재 상태를 동적으로 전달. "50%", "활성화됨" 등.
│
├─ "이 요소의 역할이 시각적으로만 암시되는가?"
│   └─→ .accessibilityAddTraits(.isButton / .isHeader / .isLink)
│       WHY: onTapGesture로 만든 버튼은 VoiceOver가 버튼으로 인식 못한다.
│
├─ "이 요소는 순수 장식인가?"
│   └─→ .accessibilityHidden(true)
│       WHY: 배경 이미지, 장식 아이콘 등은 VoiceOver 탐색에서 제외해야 한다.
│
└─ "여러 요소를 하나로 읽어야 하는가?"
    └─→ .accessibilityElement(children: .combine)
        WHY: "이름", "나이", "도시"를 3번 스와이프 대신 1번에 읽는다.
```

## 결정 다이어그램: 이미지 접근성

```
"이 이미지의 목적은 무엇인가?"
│
├─ "순수 장식 (배경, 구분선, 패턴)"
│   └─→ .accessibilityHidden(true)
│       WHY: VoiceOver가 "이미지"라고 불필요하게 읽는 것을 방지.
│
├─ "정보를 전달 (제품 사진, 차트, 배너)"
│   └─→ .accessibilityLabel("의미 있는 설명")
│       WHY: 시각 장애인이 이미지가 전달하는 정보를 이해할 수 있게.
│
├─ "인터랙티브 (탭 가능한 이미지)"
│   └─→ .accessibilityLabel("동작 설명") + .accessibilityAddTraits(.isButton)
│       WHY: 탭 가능하다는 것과 탭하면 무엇이 일어나는지를 모두 전달.
│
└─ "SF Symbol (시스템 아이콘)"
    ├─ "텍스트와 함께 사용?" → 접근성 설정 불필요 (텍스트가 설명)
    └─ "아이콘만 사용?" → .accessibilityLabel("동작/의미")
        WHY: SF Symbol의 기본 label은 영어이고 부정확할 수 있다.
```

## VoiceOver 레이블 규칙

- 아이콘 버튼에는 반드시 `.accessibilityLabel`을 추가한다
  - WHY: 레이블이 없으면 VoiceOver가 "버튼"만 읽어서 무슨 버튼인지 알 수 없다.
- 상태에 따라 레이블을 동적으로 변경한다 (예: "즐겨찾기 추가" ↔ "즐겨찾기 해제")
  - WHY: 정적 레이블은 현재 상태를 반영하지 못해 유저가 혼란스러워한다.
- `accessibilityLabel`과 `accessibilityIdentifier`를 혼동하지 않는다
  - WHY: label은 유저에게 읽히는 텍스트, identifier는 테스트 자동화용 ID.

## Dynamic Type 규칙

- `.font(.system(size: N))` 대신 `.font(.title)`, `.font(.body)` 등 텍스트 스타일을 사용한다
  - WHY: 시스템 설정에서 글꼴 크기를 변경해도 하드코딩 크기는 변하지 않는다.
- 커스텀 폰트는 `relativeTo:` 파라미터로 Dynamic Type을 지원한다
  - WHY: `.font(.custom("Font", size: 24, relativeTo: .title))`은 시스템 크기 설정에 비례하여 조절된다.
- 레이아웃이 큰 글꼴에서 깨지지 않는지 확인한다
  - WHY: AX5 (가장 큰 접근성 크기)에서 텍스트가 잘리거나 겹치는 경우가 흔하다.

## 터치 타겟 규칙

- 모든 인터랙티브 요소는 최소 44x44pt 터치 영역을 확보한다
  - WHY: Apple Human Interface Guidelines의 최소 터치 타겟. 이보다 작으면 정확하게 탭하기 어렵다.
- 시각적 크기가 작아도 `.contentShape`로 터치 영역을 확장한다
  - WHY: 16x16 아이콘이라도 터치 가능 영역은 44x44이어야 한다.

## 접근성 그룹화 규칙

- 논리적으로 관련된 텍스트 요소를 `.accessibilityElement(children: .combine)`으로 그룹화한다
  - WHY: "이름", "나이", "도시"를 각각 읽으면 3번 스와이프가 필요하다. 그룹화하면 1번.
- 리스트 행(row)은 그룹화하여 하나의 접근성 요소로 만든다
  - WHY: 행 안의 각 Text, Image를 개별로 탐색하면 리스트 네비게이션이 비효율적이다.
- `.contain`과 `.combine`의 차이를 이해한다
  - WHY: `.combine`은 자식을 하나로 합치고, `.contain`은 자식을 개별 접근성 요소로 유지한다.

## 상태 공지 규칙

- 비동기 작업 완료 후 화면이 바뀌면 VoiceOver에 공지한다
  - WHY: VoiceOver 유저는 화면 변경을 볼 수 없다. 프로그래매틱 공지가 필요하다.
- `AccessibilityNotification.Announcement`로 상태 변경을 알린다
  - WHY: "로딩 완료", "저장됨" 등의 피드백을 음성으로 전달.
- `AccessibilityNotification.ScreenChanged`로 화면 전환을 알린다
  - WHY: 새 화면으로 이동했을 때 VoiceOver 포커스를 적절한 위치로 이동시킨다.

## 색상 대비 규칙

- 색상만으로 정보를 전달하지 않는다
  - WHY: 색각 이상자(인구의 약 8%)가 빨강/초록 구분을 못 할 수 있다.
- 상태 표시에 색상 + 아이콘 + 텍스트를 조합한다
  - WHY: "빨간 원"보다 "X 아이콘 + 실패 텍스트 + 빨간색"이 모든 유저에게 명확하다.
- 텍스트와 배경의 대비 비율 4.5:1 이상을 확보한다
  - WHY: WCAG 2.1 AA 기준. 저시력 유저와 밝은 환경에서의 가독성을 보장한다.

## 리소스

- [Accessibility — Apple Developer Documentation](https://developer.apple.com/documentation/accessibility)
- [SwiftUI Accessibility Modifiers](https://developer.apple.com/documentation/swiftui/view-accessibility)
- [WWDC23: Build accessible apps with SwiftUI and UIKit](https://developer.apple.com/videos/play/wwdc2023/10036/)
- [WWDC21: SwiftUI Accessibility: Beyond the basics](https://developer.apple.com/videos/play/wwdc2021/10119/)
- [WWDC19: Accessibility in SwiftUI](https://developer.apple.com/videos/play/wwdc2019/238/)
- [Human Interface Guidelines: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
