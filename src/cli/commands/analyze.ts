import { Command } from "commander";
import path from "node:path";
import chalk from "chalk";
import { analyzeProject } from "../../analyzer/index.js";

export function registerAnalyze(program: Command) {
  program
    .command("analyze")
    .description("프로젝트를 분석하고 결과를 출력합니다 (파일 생성 없음)")
    .option("-t, --target <path>", "대상 레포 경로", process.cwd())
    .action(async (opts) => {
      const rootDir = path.resolve(opts.target);
      console.log(chalk.bold("\n🔍 프로젝트 분석\n"));
      console.log(`대상: ${chalk.cyan(rootDir)}\n`);

      const result = await analyzeProject(rootDir);

      // 플랫폼
      console.log(chalk.bold("플랫폼:"));
      if (result.platforms.length === 0) {
        console.log(chalk.gray("  감지된 플랫폼 없음"));
      } else {
        for (const p of result.platforms) {
          console.log(`  ${chalk.cyan(p.id)} — 확신도 ${Math.round(p.confidence * 100)}%`);
          for (const s of p.signals) {
            console.log(chalk.gray(`    • ${s}`));
          }
        }
      }

      // 모노레포
      if (result.monorepo) {
        console.log(chalk.bold("\n모노레포:"));
        console.log(`  도구: ${result.monorepo.tool}`);
        for (const ws of result.monorepo.workspaces) {
          console.log(`  ${chalk.cyan(ws.path)} → ${ws.platform.id}`);
        }
      }

      // 아키텍처
      console.log(chalk.bold("\n아키텍처:"));
      console.log(`  패턴: ${result.architecture.pattern} (확신도 ${Math.round(result.architecture.confidence * 100)}%)`);
      for (const s of result.architecture.signals) {
        console.log(chalk.gray(`    • ${s}`));
      }

      // 의존성
      for (const [platform, deps] of Object.entries(result.dependencies)) {
        if (deps.length === 0) continue;
        console.log(chalk.bold(`\n의존성 (${platform}):`));
        const grouped = groupBy(deps, (d: any) => d.category ?? "other");
        for (const [cat, items] of Object.entries(grouped)) {
          console.log(`  ${cat}: ${(items as any[]).map((d: any) => d.name).join(", ")}`);
        }
      }

      // 테스트
      console.log(chalk.bold("\n테스트:"));
      console.log(`  프레임워크: ${result.testing.framework}`);
      console.log(`  테스트 존재: ${result.testing.hasTests ? "예" : "아니오"}`);
      console.log(`  커버리지 추정: ${result.testing.estimatedCoverage}`);

      // 권한
      if (result.permissions.length > 0) {
        console.log(chalk.bold("\n권한:"));
        for (const p of result.permissions) {
          console.log(`  • ${p}`);
        }
      }

      // 빌드 커맨드
      if (result.buildCommands.build || result.buildCommands.test) {
        console.log(chalk.bold("\n빌드 커맨드:"));
        if (result.buildCommands.build) console.log(`  build: ${result.buildCommands.build}`);
        if (result.buildCommands.test) console.log(`  test: ${result.buildCommands.test}`);
      }

      // 추천
      console.log(chalk.bold("\n추천:"));
      console.log(`  프로필: ${chalk.cyan(result.suggestedProfile)}`);
      console.log(`  스킬: ${chalk.cyan(result.suggestedSkills.join(", "))}`);
      console.log();
    });
}

function groupBy<T>(arr: T[], fn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const key = fn(item);
    (result[key] ??= []).push(item);
  }
  return result;
}
