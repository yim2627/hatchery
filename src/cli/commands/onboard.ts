import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import fg from "fast-glob";
import { analyzeProject } from "../../analyzer/index.js";
import { generate } from "../../generator/index.js";
import { stateExists, loadState } from "../../state/index.js";
import type { ProjectConfig, ProfileName, PlatformId } from "../../types/index.js";

export function registerOnboard(program: Command) {
  program
    .command("onboard")
    .description("프로젝트를 분석하고 AI 하네스를 생성합니다")
    .option("-t, --target <path>", "대상 레포 경로", process.cwd())
    .option("-p, --profile <name>", "프로필 (basic/intermediate/advanced)")
    .option("-s, --skills <list>", "스킬 목록 (쉼표 구분)")
    .option("-w, --workflows <list>", "워크플로 목록 (쉼표 구분)")
    .option("--platform <list>", "플랫폼 목록 (쉼표 구분)")
    .option("--non-interactive", "비인터랙티브 모드")
    .option("--force", "기존 설정을 덮어쓰기")
    .action(async (opts) => {
      const rootDir = path.resolve(opts.target);

      console.log(chalk.bold("\n🥚 Hatchery 온보딩 시작\n"));
      console.log(`대상: ${chalk.cyan(rootDir)}`);

      // 기존 상태 확인
      if (stateExists(rootDir) && !opts.force) {
        const existing = loadState(rootDir);
        if (existing) {
          console.log(chalk.yellow("\n이미 온보딩된 프로젝트입니다."));
          console.log(`  프로필: ${existing.profile}`);
          console.log(`  스킬: ${existing.skills.join(", ")}`);
          console.log(`  플랫폼: ${existing.platforms.join(", ")}`);
          console.log(chalk.gray("\n--force 플래그로 재실행할 수 있습니다.\n"));
          return;
        }
      }

      // 1. 분석
      console.log(chalk.gray("\n프로젝트 분석 중..."));
      const analysis = await analyzeProject(rootDir);

      console.log(chalk.green("✓ 분석 완료"));
      if (analysis.platforms.length > 0) {
        console.log(`  감지된 플랫폼: ${analysis.platforms.map((p) => `${p.id} (${Math.round(p.confidence * 100)}%)`).join(", ")}`);
      }
      if (analysis.monorepo) {
        console.log(`  모노레포: ${analysis.monorepo.tool} (${analysis.monorepo.workspaces.length}개 워크스페이스)`);
      }
      console.log(`  아키텍처 추정: ${analysis.architecture.pattern}`);
      console.log(`  추천 프로필: ${analysis.suggestedProfile}`);
      console.log(`  추천 스킬: ${analysis.suggestedSkills.join(", ")}`);

      // 2. 설정 결정 (CLI 플래그 > 분석 결과)
      const platforms: PlatformId[] = opts.platform
        ? opts.platform.split(",").map((s: string) => s.trim())
        : analysis.platforms.map((p) => p.id);

      const profile: ProfileName = (opts.profile ?? analysis.suggestedProfile) as ProfileName;

      const skills: string[] = opts.skills
        ? opts.skills.split(",").map((s: string) => s.trim())
        : analysis.suggestedSkills;

      const defaultWorkflows = ["add-feature", "fix-bug", "refactor", "build", "review", "verify"];
      const workflows: string[] = opts.workflows
        ? opts.workflows.split(",").map((s: string) => s.trim())
        : defaultWorkflows;

      // 3. .hatchery/config.json 생성 (분석 결과 기반)
      const config = buildProjectConfig(analysis, platforms, rootDir);
      const configWithMeta = { ...config, analyzed_at: new Date().toISOString() };
      const configPath = path.join(rootDir, ".hatchery", "config.json");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(configWithMeta, null, 2) + "\n");
      console.log(chalk.green(`\n✓ 분석 결과 저장: .hatchery/config.json`));

      // 4. 생성
      console.log(chalk.gray("\n하네스 파일 생성 중..."));
      const result = generate({
        rootDir,
        config,
        profile,
        skills,
        workflows,
        platforms,
      });

      // 5. 결과 출력
      console.log(chalk.green.bold("\n✓ 온보딩 완료!\n"));
      console.log(`프로필: ${chalk.cyan(profile)}`);
      console.log(`플랫폼: ${chalk.cyan(platforms.join(", "))}`);
      console.log(`스킬: ${chalk.cyan(skills.join(", "))}`);
      console.log(`\n생성된 파일 (${result.filesCreated.length}개):`);
      for (const f of result.filesCreated) {
        console.log(`  ${chalk.gray("•")} ${f}`);
      }

      console.log(chalk.bold("\n다음 단계:"));
      console.log(`  1. ${chalk.cyan(".hatchery/config.json")}의 분석 결과가 맞는지 확인`);
      console.log(`  2. ${chalk.cyan("CLAUDE.md")}를 확인`);
      console.log(`  3. Claude Code로 작업 시작`);
      console.log(`  4. ${chalk.cyan(".hatchery/")}를 버전 관리에 포함\n`);
    });
}

function buildProjectConfig(analysis: any, platforms: PlatformId[], rootDir: string): ProjectConfig {
  return {
    project_name: inferProjectName(rootDir),
    platforms,
    ui_framework: inferUIFramework(analysis, platforms),
    architecture_style: analysis.architecture.pattern,
    min_version: inferMinVersion(platforms, rootDir),
    package_manager: inferPackageManager(rootDir),
    project_generator: inferProjectGenerator(rootDir),
    test_framework: analysis.testing.framework ?? "unknown",
    lint_tools: inferLintTools(rootDir),
    network_layer_name: inferNetworkLayer(analysis),
    persistence_layer_name: inferPersistenceLayer(analysis),
    logging_system: inferLoggingSystem(platforms),
    privacy_requirements: "최소 권한 원칙에 따른 데이터 처리",
    preferred_file_line_limit: 300,
    build_command: analysis.buildCommands.build ?? "",
    test_command: analysis.buildCommands.test ?? "",
  };
}

function inferProjectName(rootDir: string): string {
  // 1. xcodeproj 이름에서 추출
  try {
    const entries = fs.readdirSync(rootDir);
    const xcodeproj = entries.find((e) => e.endsWith(".xcodeproj"));
    if (xcodeproj) return xcodeproj.replace(".xcodeproj", "");
  } catch { /* skip */ }

  // 2. Package.swift에서 name 추출
  const pkgSwift = path.join(rootDir, "Package.swift");
  if (fs.existsSync(pkgSwift)) {
    try {
      const content = fs.readFileSync(pkgSwift, "utf-8");
      const match = content.match(/name:\s*"([^"]+)"/);
      if (match) return match[1];
    } catch { /* skip */ }
  }

  // 3. package.json에서 name 추출
  const pkgJson = path.join(rootDir, "package.json");
  if (fs.existsSync(pkgJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJson, "utf-8"));
      if (pkg.name && !pkg.name.startsWith("@")) return pkg.name;
    } catch { /* skip */ }
  }

  // 4. 디렉토리명 폴백
  return path.basename(rootDir);
}

function inferUIFramework(analysis: any, platforms: PlatformId[]): string {
  if (analysis.framework) return analysis.framework;
  if (platforms.includes("ios")) {
    const counts: Record<string, number> = analysis.frameworkCounts ?? {};
    const swiftUICount = counts["SwiftUI"] ?? 0;
    const uiKitCount = counts["UIKit"] ?? 0;

    if (swiftUICount === 0 && uiKitCount === 0) return "SwiftUI";
    if (uiKitCount === 0) return "SwiftUI";
    if (swiftUICount === 0) return "UIKit";

    // 둘 다 있으면 비율로 판단
    const total = swiftUICount + uiKitCount;
    const swiftUIRatio = swiftUICount / total;
    if (swiftUIRatio >= 0.7) return "SwiftUI";
    if (swiftUIRatio <= 0.3) return "UIKit (SwiftUI 부분 적용)";
    return "UIKit + SwiftUI (혼합)";
  }
  if (platforms.includes("nextjs")) return "Next.js";
  if (platforms.includes("react")) return "React";
  if (platforms.includes("vue")) return "Vue";
  if (platforms.includes("expo")) return "Expo (React Native)";
  return "unknown";
}

function inferMinVersion(platforms: PlatformId[], rootDir: string): string {
  if (!platforms.includes("ios")) return "";

  // pbxproj에서 실제 deployment target 읽기
  try {
    const pbxprojs = fg.sync("**/*.pbxproj", {
      cwd: rootDir,
      deep: 3,
      ignore: ["Pods/**", ".build/**", "node_modules/**"],
    });
    for (const pbx of pbxprojs) {
      const content = fs.readFileSync(path.join(rootDir, pbx), "utf-8");
      const match = content.match(/IPHONEOS_DEPLOYMENT_TARGET\s*=\s*([^;]+)/);
      if (match) {
        const version = match[1].trim().replace(/"/g, "");
        return `iOS ${version}`;
      }
    }
  } catch {
    // fallback
  }

  return "iOS 17";
}

function inferPackageManager(rootDir: string): string {
  if (fs.existsSync(path.join(rootDir, "Package.swift"))) return "Swift Package Manager";
  if (fs.existsSync(path.join(rootDir, "Podfile"))) return "CocoaPods";
  if (fs.existsSync(path.join(rootDir, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(rootDir, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(rootDir, "bun.lockb"))) return "bun";
  if (fs.existsSync(path.join(rootDir, "package-lock.json"))) return "npm";

  // Xcode 프로젝트는 내장 SPM 사용 가능 (.xcodeproj는 디렉토리)
  const hasXcodeproj = fg.sync("**/*.xcodeproj", {
    cwd: rootDir,
    deep: 2,
    onlyDirectories: true,
    ignore: ["Pods/**", ".build/**", "node_modules/**"],
  }).length > 0;
  if (hasXcodeproj) return "Xcode (SPM)";

  return "unknown";
}

function inferProjectGenerator(rootDir: string): string {
  // Tuist: Project.swift 또는 Tuist/ 디렉토리
  const hasTuist = fs.existsSync(path.join(rootDir, "Project.swift"))
    || fs.existsSync(path.join(rootDir, "Tuist"))
    || fg.sync("**/Project.swift", { cwd: rootDir, deep: 2 }).length > 0;
  if (hasTuist) return "Tuist";

  // XcodeGen: project.yml
  const hasXcodeGen = fs.existsSync(path.join(rootDir, "project.yml"))
    || fg.sync("**/project.yml", { cwd: rootDir, deep: 2 }).length > 0;
  if (hasXcodeGen) return "XcodeGen";

  // Bazel
  if (fs.existsSync(path.join(rootDir, "BUILD")) || fs.existsSync(path.join(rootDir, "BUILD.bazel"))) return "Bazel";

  // create-react-app, Vite, etc.
  if (fs.existsSync(path.join(rootDir, "vite.config.ts")) || fs.existsSync(path.join(rootDir, "vite.config.js"))) return "Vite";
  if (fs.existsSync(path.join(rootDir, "next.config.js")) || fs.existsSync(path.join(rootDir, "next.config.mjs"))) return "Next.js";

  // Xcode 기본
  const hasXcodeproj = fg.sync("**/*.xcodeproj", {
    cwd: rootDir,
    deep: 2,
    onlyDirectories: true,
    ignore: ["Pods/**", ".build/**", "node_modules/**"],
  }).length > 0;
  if (hasXcodeproj) return "Xcode";

  return "감지 안 됨";
}

function inferLintTools(rootDir: string): string {
  const tools: string[] = [];
  if (fs.existsSync(path.join(rootDir, ".swiftlint.yml"))) tools.push("SwiftLint");
  if (fs.existsSync(path.join(rootDir, ".swiftformat"))) tools.push("SwiftFormat");
  if (fs.existsSync(path.join(rootDir, ".eslintrc.js")) || fs.existsSync(path.join(rootDir, ".eslintrc.json")) || fs.existsSync(path.join(rootDir, "eslint.config.js")) || fs.existsSync(path.join(rootDir, "eslint.config.mjs"))) tools.push("ESLint");
  if (fs.existsSync(path.join(rootDir, ".prettierrc")) || fs.existsSync(path.join(rootDir, ".prettierrc.js"))) tools.push("Prettier");
  if (fs.existsSync(path.join(rootDir, "biome.json"))) tools.push("Biome");
  return tools.join(", ") || "없음";
}

function inferNetworkLayer(analysis: any): string {
  const deps = Object.values(analysis.dependencies).flat() as any[];
  const networkDeps = deps.filter((d: any) => d.category === "networking");
  if (networkDeps.length > 0) return networkDeps.map((d: any) => d.name).join(" + ");
  return "API Client";
}

function inferPersistenceLayer(analysis: any): string {
  const deps = Object.values(analysis.dependencies).flat() as any[];
  const storageDeps = deps.filter((d: any) => d.category === "storage");
  if (storageDeps.length > 0) return storageDeps.map((d: any) => d.name).join(" + ");

  // 퍼스트파티 프레임워크에서 감지 (SwiftData, CoreData 등)
  const frameworks: string[] = analysis.frameworks ?? [];
  if (frameworks.includes("SwiftData")) return "SwiftData";
  if (frameworks.includes("CoreData")) return "CoreData";

  return "감지 안 됨";
}

function inferLoggingSystem(platforms: PlatformId[]): string {
  if (platforms.includes("ios")) return "OSLog";
  return "console / 구조화 로깅";
}
