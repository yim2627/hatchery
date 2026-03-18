# iOS 접근성 안티패턴

심각도별로 정리한 안티패턴과 수정 방법.

## 체크리스트

| ID | 안티패턴 | 심각도 | 탐지 규칙 | 수정 방법 |
|---|---|---|---|---|
| C1 | 인터랙티브 요소에 접근성 레이블 없음 | CRITICAL | `Button` + `Image(systemName:)` 조합에 `.accessibilityLabel` 없음 | `.accessibilityLabel()` 추가 |
| C2 | 정보성 이미지에 설명 없음 | CRITICAL | `Image()`/`AsyncImage()`에 `.accessibilityLabel` 없음 | 의미 있는 설명 추가, 장식용은 `.accessibilityHidden(true)` |
| C3 | 하드코딩 폰트 크기 | CRITICAL | `.font(.system(size: N))` 사용 | `.font(.title)` 등 텍스트 스타일 사용 |
| C4 | 터치 타겟이 44pt 미만 | CRITICAL | `.frame(width/height:)` 값이 44 미만인 터치 요소 | 최소 44x44pt 확보 |
| W1 | 색상만으로 정보 전달 | WARNING | 상태 구분에 `.fill(color)` 만 사용, 아이콘/텍스트 없음 | 색상 + 아이콘 + 텍스트 조합 |
| W2 | VoiceOver 탐색 순서 불일치 | WARNING | `ZStack`에서 순서 미지정 | `.accessibilitySortPriority()` 설정 |
| W3 | 접근성 그룹화 누락 | WARNING | 관련 Text 요소를 개별 접근성 요소로 방치 | `.accessibilityElement(children: .combine)` |
| W4 | 상태 변경 미공지 | WARNING | 비동기 로딩 후 VoiceOver 알림 없음 | `AccessibilityNotification` post |
| W5 | 커스텀 컨트롤 trait 누락 | WARNING | `onTapGesture`에 `.accessibilityAddTraits` 없음 | `.accessibilityAddTraits(.isButton)` 추가 |

## 목차

- C1. 인터랙티브 요소에 접근성 레이블 없음
- C2. 정보성 이미지에 설명 없음
- C3. 하드코딩된 폰트 크기
- C4. 터치 타겟이 너무 작음
- W1. 색상만으로 정보 전달
- W2. VoiceOver 탐색 순서 불일치
- W3. 접근성 요소 그룹화 누락
- W4. 상태 변경을 VoiceOver에 미공지
- W5. 커스텀 컨트롤의 접근성 trait 누락
- 변환 패턴: UIKit → SwiftUI 접근성, accessibilityIdentifier vs Label, 레거시 공지 → SwiftUI 공지

---

## CRITICAL — VoiceOver 사용 불가

### C1. 인터랙티브 요소에 접근성 레이블 없음

```swift
// ❌ VoiceOver가 "버튼"만 읽음 — 무슨 버튼인지 모름
Button(action: { dismiss() }) {
    Image(systemName: "xmark")
}

// ❌ 아이콘만 있는 커스텀 버튼
Button(action: { toggleFavorite() }) {
    Image(isFavorite ? "heart.fill" : "heart")
}

// ✅ 접근성 레이블 추가
Button(action: { dismiss() }) {
    Image(systemName: "xmark")
}
.accessibilityLabel("닫기")

Button(action: { toggleFavorite() }) {
    Image(isFavorite ? "heart.fill" : "heart")
}
.accessibilityLabel(isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가")
```

### C2. 정보성 이미지에 설명 없음

```swift
// ❌ VoiceOver가 "이미지"만 읽거나 파일명을 읽음
Image("promotion_banner")

AsyncImage(url: product.imageURL)

// ✅ 의미 있는 설명 제공
Image("promotion_banner")
    .accessibilityLabel("봄 세일 최대 50% 할인")

AsyncImage(url: product.imageURL)
    .accessibilityLabel("\(product.name) 제품 이미지")

// 장식용 이미지는 접근성 트리에서 제외
Image("background_pattern")
    .accessibilityHidden(true)
```

### C3. 하드코딩된 폰트 크기 — Dynamic Type 무시

```swift
// ❌ 시스템 설정에서 글꼴 크기를 키워도 변하지 않음
Text("제목")
    .font(.system(size: 24))

Text("본문")
    .font(.system(size: 14))

// ✅ Dynamic Type을 지원하는 텍스트 스타일
Text("제목")
    .font(.title)

Text("본문")
    .font(.body)

// 커스텀 폰트도 Dynamic Type 지원
Text("커스텀")
    .font(.custom("Pretendard-Bold", size: 24, relativeTo: .title))
```

### C4. 터치 타겟이 너무 작음

```swift
// ❌ 44x44pt 미만 — 탭하기 어려움
Button("삭제") { delete() }
    .frame(width: 20, height: 20)

Image(systemName: "info.circle")
    .onTapGesture { showInfo() }
    .frame(width: 16, height: 16)

// ✅ 최소 44x44pt 터치 영역 확보
Button("삭제") { delete() }
    .frame(minWidth: 44, minHeight: 44)

Image(systemName: "info.circle")
    .onTapGesture { showInfo() }
    .frame(width: 16, height: 16)
    .contentShape(Rectangle().size(width: 44, height: 44))
```

---

## WARNING — 접근성 저하

### W1. 색상만으로 정보 전달

```swift
// ❌ 빨간색 = 에러, 초록색 = 성공 — 색각 이상자가 구분 못함
Circle()
    .fill(status == .error ? .red : .green)

// ✅ 색상 + 아이콘 + 텍스트
HStack {
    Image(systemName: status == .error ? "xmark.circle" : "checkmark.circle")
    Text(status == .error ? "실패" : "성공")
}
.foregroundStyle(status == .error ? .red : .green)
```

### W2. VoiceOver 탐색 순서가 시각적 순서와 다름

```swift
// ❌ ZStack에서 VoiceOver가 시각적 순서와 다르게 읽음
ZStack {
    BackgroundView()
    ContentView()
    FloatingButton()
}

// ✅ 탐색 순서 명시
ZStack {
    BackgroundView()
        .accessibilityHidden(true)
    ContentView()
        .accessibilitySortPriority(2)
    FloatingButton()
        .accessibilitySortPriority(1)
}
```

### W3. 접근성 요소를 그룹화하지 않음

```swift
// ❌ VoiceOver가 각 요소를 따로 읽음 → "홍길동" "25세" "서울" → 3번 스와이프
VStack {
    Text(user.name)
    Text("\(user.age)세")
    Text(user.city)
}

// ✅ 하나의 접근성 요소로 그룹화
VStack {
    Text(user.name)
    Text("\(user.age)세")
    Text(user.city)
}
.accessibilityElement(children: .combine)
// VoiceOver: "홍길동, 25세, 서울" → 1번 스와이프
```

### W4. 상태 변경을 VoiceOver에 알리지 않음

```swift
// ❌ 비동기 로딩 후 화면이 바뀌어도 VoiceOver는 모름
func load() async {
    state = .loading
    let data = try? await api.fetch()
    state = .loaded(data)
    // VoiceOver 유저는 화면이 바뀐 줄 모름
}

// ✅ 접근성 공지
func load() async {
    state = .loading
    AccessibilityNotification.Announcement("로딩 중").post()

    let data = try? await api.fetch()
    state = .loaded(data)
    AccessibilityNotification.ScreenChanged(nil).post()
}
```

### W5. 커스텀 컨트롤의 접근성 trait 누락

```swift
// ❌ VoiceOver가 이 뷰를 버튼으로 인식 못함
HStack {
    Image(systemName: "star")
    Text("즐겨찾기")
}
.onTapGesture { toggleFavorite() }

// ✅ 접근성 trait 설정
HStack {
    Image(systemName: "star")
    Text("즐겨찾기")
}
.onTapGesture { toggleFavorite() }
.accessibilityAddTraits(.isButton)
.accessibilityLabel("즐겨찾기")
.accessibilityValue(isFavorite ? "활성화됨" : "비활성화됨")
```

---

## 변환 패턴

### UIKit 접근성 → SwiftUI 접근성

```swift
// Before (UIKit)
label.accessibilityLabel = "사용자 이름"
label.accessibilityTraits = .header
label.isAccessibilityElement = true

button.accessibilityHint = "프로필을 수정합니다"

view.accessibilityElements = [titleLabel, descriptionLabel, actionButton]

// After (SwiftUI)
Text("사용자 이름")
    .accessibilityLabel("사용자 이름")
    .accessibilityAddTraits(.isHeader)

Button("수정") { editProfile() }
    .accessibilityHint("프로필을 수정합니다")

VStack {
    Text(title)
    Text(description)
    Button("액션") { action() }
}
.accessibilityElement(children: .contain)
```

| UIKit | SwiftUI |
|---|---|
| `.accessibilityLabel = ""` | `.accessibilityLabel("")` |
| `.accessibilityTraits = .button` | `.accessibilityAddTraits(.isButton)` |
| `.isAccessibilityElement = false` | `.accessibilityHidden(true)` |
| `.accessibilityHint = ""` | `.accessibilityHint("")` |
| `.accessibilityValue = ""` | `.accessibilityValue("")` |
| `UIAccessibility.post(notification:)` | `AccessibilityNotification.post()` |

### accessibilityIdentifier vs accessibilityLabel

```swift
// accessibilityIdentifier — 테스트용 (유저에게 읽히지 않음)
Button("저장") { save() }
    .accessibilityIdentifier("save-button") // UI 테스트에서 식별

// accessibilityLabel — VoiceOver가 읽는 텍스트
Button(action: { save() }) {
    Image(systemName: "square.and.arrow.down")
}
.accessibilityLabel("저장") // VoiceOver: "저장, 버튼"

// 둘은 목적이 다르므로 혼동하지 않는다
// identifier: 테스트 자동화용 ID
// label: 보조 기술이 읽는 사람을 위한 설명
```

### 레거시 UIAccessibility 공지 → SwiftUI 공지

```swift
// Before (UIKit)
UIAccessibility.post(
    notification: .announcement,
    argument: "저장되었습니다"
)

UIAccessibility.post(
    notification: .screenChanged,
    argument: newView
)

// After (SwiftUI / iOS 17+)
AccessibilityNotification.Announcement("저장되었습니다").post()

AccessibilityNotification.ScreenChanged(nil).post()
```
