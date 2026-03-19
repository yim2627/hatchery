#!/bin/bash
set -euo pipefail

# Usage: ./scripts/release.sh <patch|minor|major>

BUMP_TYPE="${1:-patch}"

if [[ "$BUMP_TYPE" != "patch" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "major" ]]; then
  echo "Usage: $0 <patch|minor|major>"
  exit 1
fi

# 1. 미커밋 변경 확인
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: 커밋되지 않은 변경사항이 있습니다. 먼저 커밋하세요."
  exit 1
fi

# 2. package.json 버전 bump (git tag/commit 없이)
NEW_VERSION=$(npm version "$BUMP_TYPE" --no-git-tag-version)
VERSION_NUM="${NEW_VERSION#v}"
echo "Version bumped to $VERSION_NUM"

# 3. CLAUDE.md 버전 업데이트
if grep -q "## 현재 버전:" CLAUDE.md; then
  sed -i '' "s/## 현재 버전: v.*/## 현재 버전: v${VERSION_NUM}/" CLAUDE.md
fi

# 4. 빌드 검증
echo "Building..."
npm run build

# 5. 커밋 + 태그 + 푸시
git add package.json CLAUDE.md
git commit -m "release: v${VERSION_NUM}"
git tag -a "v${VERSION_NUM}" -m "release: v${VERSION_NUM}"
git push origin main
git push origin "v${VERSION_NUM}"

echo ""
echo "v${VERSION_NUM} 릴리즈 완료!"
echo "GitHub Actions가 npm publish + Release 생성을 처리합니다."
