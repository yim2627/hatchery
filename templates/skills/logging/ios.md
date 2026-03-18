# 로깅 규칙 — iOS

- 구조화된 로깅에 `os.Logger`(OSLog)를 선호한다.
- subsystem과 category로 로그 출력을 구성한다.
- OSLog 보간에서 민감한 데이터는 `.private`로 표시한다.
- 프로덕션 코드에서 `print()`를 피하고 구조화된 로깅을 사용한다.
