import { Command } from "commander";
import path from "node:path";
import chalk from "chalk";
import { loadState } from "../../state/index.js";
import { audit } from "../../auditor/index.js";

export function registerAudit(program: Command) {
  program
    .command("audit")
    .description("활성 스킬의 규칙 준수 여부를 검증합니다")
    .option("-t, --target <path>", "대상 레포 경로", process.cwd())
    .option("--since <ref>", "Git ref 이후 변경된 파일만 검사 (예: HEAD~1)")
    .action(async (opts) => {
      const rootDir = path.resolve(opts.target);
      const state = loadState(rootDir);

      if (!state) {
        console.log(chalk.red("상태 파일을 찾을 수 없습니다. 먼저 'hatchery onboard'를 실행하세요."));
        process.exit(1);
      }

      console.log(chalk.bold("\n🔎 규칙 준수 검증\n"));
      if (opts.since) {
        console.log(chalk.gray(`범위: ${opts.since} 이후 변경 파일\n`));
      }

      const result = await audit(rootDir, state, opts.since);

      if (result.findings.length === 0) {
        console.log(chalk.green("✓ 발견된 문제 없음"));
        console.log(chalk.gray(`  검사 파일: ${result.checkedFiles}개, 통과 규칙: ${result.passedRules}개\n`));
        return;
      }

      // severity별 그룹화
      const errors = result.findings.filter((f) => f.severity === "error");
      const warnings = result.findings.filter((f) => f.severity === "warning");
      const infos = result.findings.filter((f) => f.severity === "info");

      if (errors.length > 0) {
        console.log(chalk.red.bold(`CRITICAL (${errors.length}개):`));
        for (const f of errors) {
          console.log(chalk.red(`  ${f.file}:${f.line ?? "?"} — ${f.message}`));
          console.log(chalk.gray(`    규칙: ${f.skill}/${f.rule}`));
        }
        console.log();
      }

      if (warnings.length > 0) {
        console.log(chalk.yellow.bold(`WARNING (${warnings.length}개):`));
        for (const f of warnings) {
          console.log(chalk.yellow(`  ${f.file}:${f.line ?? "?"} — ${f.message}`));
          console.log(chalk.gray(`    규칙: ${f.skill}/${f.rule}`));
        }
        console.log();
      }

      if (infos.length > 0) {
        console.log(chalk.blue.bold(`INFO (${infos.length}개):`));
        for (const f of infos) {
          console.log(chalk.blue(`  ${f.file}:${f.line ?? "?"} — ${f.message}`));
          console.log(chalk.gray(`    규칙: ${f.skill}/${f.rule}`));
        }
        console.log();
      }

      console.log(chalk.gray(`검사 파일: ${result.checkedFiles}개, 통과: ${result.passedRules}개, 위반: ${result.failedRules}개\n`));

      if (errors.length > 0) {
        process.exit(1);
      }
    });
}
