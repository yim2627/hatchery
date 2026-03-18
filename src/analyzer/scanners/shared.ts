import fs from "node:fs";
import path from "node:path";

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "Pods", ".build", ".next", "dist", "build",
  ".hatchery", ".swiftpm", "DerivedData", ".turbo", ".cache",
]);

const IGNORE_FILES = new Set([
  ".DS_Store", "Thumbs.db",
]);

/**
 * 프로젝트 디렉토리 구조를 트리 형태 문자열로 생성한다.
 * 깊이 제한 + 무시 패턴 적용.
 */
export function generateDirectoryTree(rootDir: string, maxDepth = 3): string {
  const lines: string[] = [];
  const rootName = path.basename(rootDir);
  lines.push(rootName + "/");
  walkDir(rootDir, "", maxDepth, 0, lines);
  return lines.join("\n");
}

function walkDir(
  dir: string,
  prefix: string,
  maxDepth: number,
  currentDepth: number,
  lines: string[],
): void {
  if (currentDepth >= maxDepth) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  // 필터링 + 정렬 (디렉토리 먼저, 그 다음 파일)
  const filtered = entries
    .filter((e) => {
      if (e.name.startsWith(".") && e.name !== ".swiftlint.yml") return false;
      if (IGNORE_DIRS.has(e.name) && e.isDirectory()) return false;
      if (IGNORE_FILES.has(e.name)) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  for (let i = 0; i < filtered.length; i++) {
    const entry = filtered[i];
    const isLast = i === filtered.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    if (entry.isDirectory()) {
      // 디렉토리 내 파일 수 세기
      const childCount = countChildren(path.join(dir, entry.name));
      const suffix = childCount > 0 ? "/" : "/";
      lines.push(`${prefix}${connector}${entry.name}${suffix}`);
      walkDir(
        path.join(dir, entry.name),
        prefix + childPrefix,
        maxDepth,
        currentDepth + 1,
        lines,
      );
    } else {
      lines.push(`${prefix}${connector}${entry.name}`);
    }
  }
}

function countChildren(dir: string): number {
  try {
    return fs.readdirSync(dir).filter((e) => !e.startsWith(".") && !IGNORE_DIRS.has(e)).length;
  } catch {
    return 0;
  }
}
