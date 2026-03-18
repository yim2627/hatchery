import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type { AuditFinding, AuditResult, AuditSeverity, HatcheryState } from "../types/index.js";

interface AuditRule {
  skill: string;
  name: string;
  severity: AuditSeverity;
  platforms: string[];
  pattern: RegExp;
  message: string;
  fileFilter?: string; // glob pattern
}

const RULES: AuditRule[] = [
  // ─── architecture ───

  {
    skill: "architecture",
    name: "view-direct-network-ios",
    severity: "warning",
    platforms: ["ios"],
    pattern: /URLSession|\.dataTask|Alamofire\.request|\.fetch\(/,
    message: "View 파일에서 네트워킹 코드가 직접 사용되고 있습니다. Repository/Service 레이어를 통해야 합니다.",
    fileFilter: "**/*View*.swift",
  },
  {
    skill: "architecture",
    name: "view-direct-network-web",
    severity: "warning",
    platforms: ["react", "nextjs", "vue"],
    pattern: /\bfetch\s*\(|axios\.|ky\(|ky\./,
    message: "UI 컴포넌트에서 직접 데이터 페칭이 발견되었습니다. 전용 hook이나 서비스 레이어로 분리를 검토하세요.",
    fileFilter: "**/components/**/*.{tsx,jsx}",
  },

  // ─── concurrency (iOS) ───

  {
    skill: "concurrency",
    name: "dispatch-queue-main",
    severity: "info",
    platforms: ["ios"],
    pattern: /DispatchQueue\.main\.async/,
    message: "새 코드에서는 `@MainActor` 또는 `MainActor.run`을 검토하세요.",
    fileFilter: "**/*.swift",
  },
  {
    skill: "concurrency",
    name: "task-detached",
    severity: "warning",
    platforms: ["ios"],
    pattern: /Task\.detached\s*\{/,
    message: "`Task.detached` 사용에 명시적 정당화가 필요합니다. 취소 전파가 끊깁니다.",
    fileFilter: "**/*.swift",
  },
  {
    skill: "concurrency",
    name: "semaphore-in-async",
    severity: "error",
    platforms: ["ios"],
    pattern: /semaphore\.wait\(\)|DispatchSemaphore/,
    message: "async 컨텍스트에서 세마포어 사용은 데드락을 유발합니다.",
    fileFilter: "**/*.swift",
  },
  {
    skill: "concurrency",
    name: "dispatch-group",
    severity: "info",
    platforms: ["ios"],
    pattern: /DispatchGroup/,
    message: "새 코드에서는 `TaskGroup`으로 대체를 검토하세요.",
    fileFilter: "**/*.swift",
  },

  // ─── concurrency (Web) ───

  {
    skill: "concurrency",
    name: "unhandled-promise",
    severity: "warning",
    platforms: ["react", "nextjs", "vue"],
    pattern: /\.then\s*\([^)]*\)\s*$/,
    message: "`.catch` 없는 Promise 체인입니다. 에러 처리를 확인하세요.",
    fileFilter: "**/*.{ts,tsx,js,jsx}",
  },

  // ─── testing ───

  {
    skill: "testing",
    name: "force-unwrap",
    severity: "warning",
    platforms: ["ios"],
    pattern: /\w\)!|"\)!|\]!/,
    message: "Force unwrap(`!`) 사용을 최소화하세요. `guard let` 또는 nil 합치기를 검토하세요.",
    fileFilter: "**/*.swift",
  },
  {
    skill: "testing",
    name: "force-try",
    severity: "warning",
    platforms: ["ios"],
    pattern: /try!/,
    message: "`try!` 사용은 런타임 크래시를 유발합니다. `do-catch` 또는 `try?`를 검토하세요.",
    fileFilter: "**/*.swift",
  },

  // ─── ui-rules ───

  {
    skill: "ui-rules",
    name: "console-log-production",
    severity: "info",
    platforms: ["react", "nextjs", "vue"],
    pattern: /console\.(log|debug|info)\s*\(/,
    message: "프로덕션 코드에서 `console.log` 사용을 검토하세요.",
    fileFilter: "**/src/**/*.{ts,tsx,js,jsx}",
  },
  {
    skill: "ui-rules",
    name: "print-in-production",
    severity: "info",
    platforms: ["ios"],
    pattern: /^\s*print\s*\(/,
    message: "프로덕션 코드에서 `print()` 대신 OSLog를 사용하세요.",
    fileFilter: "**/*.swift",
  },
  {
    skill: "ui-rules",
    name: "observable-object-ios17",
    severity: "info",
    platforms: ["ios"],
    pattern: /:\s*ObservableObject\b/,
    message: "iOS 17+ 프로젝트에서는 `@Observable`로 마이그레이션을 검토하세요.",
    fileFilter: "**/*.swift",
  },
  {
    skill: "ui-rules",
    name: "state-object-ios17",
    severity: "info",
    platforms: ["ios"],
    pattern: /@StateObject/,
    message: "iOS 17+ `@Observable` 사용 시 `@State`로 대체하세요.",
    fileFilter: "**/*.swift",
  },
  {
    skill: "ui-rules",
    name: "navigation-view-deprecated",
    severity: "info",
    platforms: ["ios"],
    pattern: /NavigationView\s*\{/,
    message: "`NavigationView`는 deprecated입니다. `NavigationStack`을 사용하세요.",
    fileFilter: "**/*.swift",
  },

  // ─── networking ───

  {
    skill: "networking",
    name: "raw-url-string",
    severity: "info",
    platforms: ["ios"],
    pattern: /URL\(string:\s*"https?:\/\//,
    message: "하드코딩된 URL이 있습니다. 설정이나 상수로 관리하세요.",
    fileFilter: "**/*.swift",
  },

  // ─── security (전 플랫폼) ───

  {
    skill: "architecture",
    name: "hardcoded-secret",
    severity: "error",
    platforms: ["ios", "react", "nextjs", "vue", "expo", "react-native"],
    pattern: /(api[_-]?key|secret|password|token|bearer)\s*[:=]\s*["'][A-Za-z0-9\-_.]{12,}["']/i,
    message: "하드코딩된 시크릿이 발견되었습니다. 환경변수나 Keychain/시크릿 관리를 사용하세요.",
  },
  {
    skill: "architecture",
    name: "hardcoded-url-with-key",
    severity: "warning",
    platforms: ["ios", "react", "nextjs", "vue", "expo", "react-native"],
    pattern: /["']https?:\/\/[^"']*[?&](key|token|api_key|apikey)=[^"']+["']/i,
    message: "URL에 API 키가 포함되어 있습니다. 키를 분리하세요.",
  },

  // ─── logging ───

  {
    skill: "logging",
    name: "nslog-usage",
    severity: "info",
    platforms: ["ios"],
    pattern: /NSLog\s*\(/,
    message: "`NSLog` 대신 `os.Logger`(OSLog)를 사용하세요.",
    fileFilter: "**/*.swift",
  },
];

export async function audit(
  rootDir: string,
  state: HatcheryState,
  sinceRef?: string,
): Promise<AuditResult> {
  const findings: AuditFinding[] = [];
  let checkedFiles = 0;
  let passedRules = 0;
  let failedRules = 0;

  // sinceRef가 있으면 git diff로 변경 파일만 대상
  const targetFiles = sinceRef
    ? await getChangedFiles(rootDir, sinceRef)
    : null;

  const applicableRules = RULES.filter(
    (rule) =>
      state.skills.includes(rule.skill) &&
      rule.platforms.some((p) => state.platforms.includes(p as any)),
  );

  for (const rule of applicableRules) {
    const files = await fg(rule.fileFilter ?? "**/*", {
      cwd: rootDir,
      onlyFiles: true,
      ignore: [
        "node_modules/**",
        ".git/**",
        "Pods/**",
        ".build/**",
        ".next/**",
        "dist/**",
        "build/**",
        ".hatchery/**",
        "Docs/**",
        "**/*.test.*",
        "**/*.spec.*",
        "**/*Tests*/**",
      ],
      deep: 5,
    });

    let ruleTriggered = false;

    for (const file of files) {
      // sinceRef 필터
      if (targetFiles && !targetFiles.includes(file)) continue;

      try {
        const content = fs.readFileSync(path.join(rootDir, file), "utf-8");
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          if (rule.pattern.test(lines[i])) {
            findings.push({
              severity: rule.severity,
              skill: rule.skill,
              rule: rule.name,
              file,
              line: i + 1,
              message: rule.message,
            });
            ruleTriggered = true;
          }
        }

        checkedFiles++;
      } catch {
        // skip unreadable files
      }
    }

    if (ruleTriggered) failedRules++;
    else passedRules++;
  }

  return {
    findings: deduplicateFindings(findings),
    checkedFiles,
    passedRules,
    failedRules,
  };
}

async function getChangedFiles(rootDir: string, sinceRef: string): Promise<string[]> {
  const { execSync } = await import("node:child_process");
  try {
    const output = execSync(`git diff --name-only ${sinceRef}`, {
      cwd: rootDir,
      encoding: "utf-8",
    });
    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function deduplicateFindings(findings: AuditFinding[]): AuditFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.file}:${f.line}:${f.rule}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
