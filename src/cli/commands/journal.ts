import { Command } from "commander";
import path from "node:path";
import chalk from "chalk";
import { logEntry, listEntries, getEntry, entriesToContext } from "../../journal/index.js";

export function registerJournal(program: Command) {
  const journal = program.command("journal").description("작업 이력(Task Journal) 관리");

  journal
    .command("log <message>")
    .description("작업을 기록합니다")
    .option("-t, --target <path>", "대상 레포 경로", process.cwd())
    .option("-w, --workflow <n>", "관련 워크플로")
    .option("-f, --files <list>", "변경된 파일 (쉼표 구분)")
    .action((message, opts) => {
      const rootDir = path.resolve(opts.target);
      const entry = logEntry(rootDir, message, {
        workflow: opts.workflow,
        filesChanged: opts.files?.split(",").map((s: string) => s.trim()),
      });

      console.log(chalk.green(`\n✓ 기록됨: ${entry.id}`));
      console.log(`  메시지: ${entry.message}`);
      if (entry.workflow) console.log(`  워크플로: ${entry.workflow}`);
      console.log();
    });

  journal
    .command("list")
    .description("작업 이력을 조회합니다")
    .option("-t, --target <path>", "대상 레포 경로", process.cwd())
    .option("-n, --last <n>", "최근 N개만 표시", parseInt)
    .action((opts) => {
      const rootDir = path.resolve(opts.target);
      const entries = listEntries(rootDir, opts.last);

      if (entries.length === 0) {
        console.log(chalk.gray("\n기록된 작업이 없습니다.\n"));
        return;
      }

      console.log(chalk.bold(`\n작업 이력 (${entries.length}개):\n`));
      for (const e of entries) {
        const date = e.timestamp.split("T")[0];
        const time = e.timestamp.split("T")[1]?.slice(0, 5) ?? "";
        console.log(`  ${chalk.gray(`${date} ${time}`)}  ${e.message}`);
        if (e.workflow) console.log(chalk.gray(`    워크플로: ${e.workflow}`));
        if (e.filesChanged?.length) console.log(chalk.gray(`    파일: ${e.filesChanged.join(", ")}`));
      }
      console.log();
    });

  journal
    .command("show <id>")
    .description("특정 작업 상세 조회")
    .option("-t, --target <path>", "대상 레포 경로", process.cwd())
    .action((id, opts) => {
      const rootDir = path.resolve(opts.target);
      const entry = getEntry(rootDir, id);

      if (!entry) {
        console.log(chalk.red(`항목을 찾을 수 없습니다: ${id}`));
        return;
      }

      console.log(chalk.bold(`\n${entry.message}\n`));
      console.log(`  ID: ${entry.id}`);
      console.log(`  시간: ${entry.timestamp}`);
      if (entry.workflow) console.log(`  워크플로: ${entry.workflow}`);
      if (entry.filesChanged?.length) {
        console.log(`  변경 파일:`);
        for (const f of entry.filesChanged) {
          console.log(`    • ${f}`);
        }
      }
      console.log();
    });

  journal
    .command("context")
    .description("최근 작업 이력을 에이전트 컨텍스트로 출력합니다")
    .option("-t, --target <path>", "대상 레포 경로", process.cwd())
    .option("-n, --last <n>", "최근 N개 포함", parseInt, 5)
    .action((opts) => {
      const rootDir = path.resolve(opts.target);
      const ctx = entriesToContext(rootDir, opts.last);

      if (!ctx) {
        console.log(chalk.gray("기록된 작업이 없습니다."));
        return;
      }

      console.log(ctx);
    });
}
