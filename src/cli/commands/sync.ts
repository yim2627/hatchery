import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { analyzeProject } from "../../analyzer/index.js";
import { stateExists, loadState, updateState } from "../../state/index.js";
import { buildProjectConfig } from "./onboard.js";
import type { PlatformId } from "../../types/index.js";

export function registerSync(program: Command) {
  program
    .command("sync")
    .description("프로젝트를 재분석하여 config.json만 갱신합니다 (스킬/워크플로/CLAUDE.md 유지)")
    .option("-t, --target <path>", "대상 레포 경로", process.cwd())
    .option("-w, --workspace <name>", "모노레포 워크스페이스 이름")
    .action(async (opts) => {
      const rootDir = path.resolve(opts.target);

      console.log(chalk.bold("\n🔄 Hatchery Sync\n"));
      console.log(`대상: ${chalk.cyan(rootDir)}`);

      // 1. 기존 state 확인
      if (!stateExists(rootDir, opts.workspace)) {
        console.error(chalk.red("\n❌ 온보딩 상태를 찾을 수 없습니다."));
        console.error(`   먼저 ${chalk.cyan("hatchery onboard --target " + rootDir)} 을 실행하세요.\n`);
        process.exit(1);
      }

      loadState(rootDir, opts.workspace);

      // 2. 재분석
      console.log(chalk.gray("프로젝트 재분석 중..."));
      const analysis = await analyzeProject(rootDir);
      console.log(chalk.green("✓ 분석 완료"));

      // 3. 기존 config.json 로드
      const configPath = path.join(rootDir, ".hatchery", "config.json");
      let oldConfig: Record<string, any> = {};
      if (fs.existsSync(configPath)) {
        try {
          oldConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        } catch {
          console.log(chalk.yellow("  기존 config.json 파싱 실패, 새로 생성합니다."));
        }
      }

      // 4. 새 config 빌드
      const platforms: PlatformId[] = analysis.platforms.map((p) => p.id);
      const newConfig = buildProjectConfig(analysis, platforms, rootDir);
      const newConfigWithMeta = { ...newConfig, analyzed_at: new Date().toISOString() };

      // 5. diff 비교
      const changes = diffConfigs(oldConfig, newConfigWithMeta);

      if (changes.length === 0) {
        console.log(chalk.green("\n✓ 변경 사항 없음\n"));
        return;
      }

      // 6. config.json 덮어쓰기
      fs.writeFileSync(configPath, JSON.stringify(newConfigWithMeta, null, 2) + "\n");

      // 7. state 갱신
      updateState(rootDir, { updatedAt: new Date().toISOString() }, opts.workspace);

      // 8. 변경 요약 출력
      console.log(chalk.bold(`\n변경된 필드 (${changes.length}개):\n`));
      for (const c of changes) {
        console.log(`  ${chalk.yellow(c.key)}`);
        console.log(`    ${chalk.red("- " + formatValue(c.old))}`);
        console.log(`    ${chalk.green("+ " + formatValue(c.new))}`);
      }
      console.log(chalk.green("\n✓ config.json 갱신 완료\n"));
    });
}

interface ConfigDiff {
  key: string;
  old: any;
  new: any;
}

function diffConfigs(oldConfig: Record<string, any>, newConfig: Record<string, any>): ConfigDiff[] {
  const diffs: ConfigDiff[] = [];
  const allKeys = new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)]);

  for (const key of allKeys) {
    if (key === "analyzed_at") continue;

    const oldVal = oldConfig[key];
    const newVal = newConfig[key];

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diffs.push({ key, old: oldVal, new: newVal });
    }
  }

  return diffs;
}

function formatValue(val: any): string {
  if (val === undefined) return "(없음)";
  if (Array.isArray(val)) return val.join(", ");
  return String(val);
}
