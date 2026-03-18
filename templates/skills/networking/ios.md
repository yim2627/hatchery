# 네트워킹 규칙 — iOS

- 새 코드에서는 `URLSession`의 `async/await` API를 선호한다.
- JSON 직렬화에 `Codable`을 사용하고, `CodingKeys`는 모델 가까이에 둔다.
- `URLError.cancelled`는 유저에게 에러가 아니므로 graceful하게 처리한다.
- 프로젝트가 사용하면 민감한 엔드포인트에 certificate pinning을 고려한다.
- `URLCache` 정책과 기존 캐싱 전략을 존중한다.
- 독립적인 병렬 요청에는 `TaskGroup`을 사용한다.
