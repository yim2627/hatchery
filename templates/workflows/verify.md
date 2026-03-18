# 분석 검증

`hatchery onboard` 직후, 자동 분석 결과가 실제 프로젝트와 맞는지 확인할 때.

## 확인 항목

1. `.hatchery/config.json`의 감지 결과가 실제 프로젝트와 일치하는가?
   - 플랫폼, 아키텍처 패턴, 의존성, 빌드 명령
2. 선택된 스킬이 프로젝트의 실제 도메인을 커버하는가?
   - 위치 기반 앱인데 `accessibility`가 빠졌다면 추가 필요
3. 빌드·테스트 명령이 실제로 동작하는가?
4. `CLAUDE.md`의 프로젝트 컨텍스트가 정확한가?

## 조정이 필요하면

```bash
# .hatchery/config.json을 수정한 후
hatchery render

# 스킬을 추가/제거하고 싶으면
# state.json의 skills 배열을 수정한 후
hatchery render

# 프로필을 바꾸고 싶으면
hatchery upgrade --to advanced
hatchery render
```

## 완료 시 정리

- 분석 정확도 평가, 조정한 항목, 추가/제거한 스킬.
