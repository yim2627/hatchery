import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { loadState } from "../../state/index.js";
import { getTemplatesDir } from "../../generator/renderer.js";

export function registerWorkflow(program: Command) {
  const workflow = program.command("workflow").description("워크플로 관리");

  workflow
    .command("list")
    .description("사용 가능한 워크플로 목록")
    .option("-t, --target <path>", "대상 레포 경로", process.cwd())
    .action((opts) => {
      const rootDir = path.resolve(opts.target);
      const state = loadState(rootDir);
      const templatesDir = getTemplatesDir();
      const wfDir = path.join(templatesDir, "workflows");

      console.log(chalk.bold("\n워크플로 목록:\n"));

      if (!fs.existsSync(wfDir)) {
        console.log(chalk.gray("  워크플로 템플릿을 찾을 수 없습니다."));
        return;
      }

      const available = fs
        .readdirSync(wfDir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.replace(".md", ""));

      const active = new Set(state?.workflows ?? []);

      for (const wf of available) {
        const marker = active.has(wf) ? chalk.green("●") : chalk.gray("○");
        console.log(`  ${marker} ${wf}`);
      }

      console.log();
    });

  workflow
    .command("print <n>")
    .description("워크플로 내용을 출력합니다")
    .option("-t, --target <path>", "대상 레포 경로", process.cwd())
    .action((name, opts) => {
      const rootDir = path.resolve(opts.target);

      // 생성된 워크플로 우선
      const generatedPath = path.join(rootDir, ".hatchery", "workflows", `${name}.md`);
      if (fs.existsSync(generatedPath)) {
        console.log(fs.readFileSync(generatedPath, "utf-8"));
        return;
      }

      // 템플릿 폴백
      const templatesDir = getTemplatesDir();
      const templatePath = path.join(templatesDir, "workflows", `${name}.md`);
      if (fs.existsSync(templatePath)) {
        console.log(fs.readFileSync(templatePath, "utf-8"));
        return;
      }

      console.log(chalk.red(`워크플로를 찾을 수 없습니다: ${name}`));
    });

  workflow
    .command("scaffold <names...>")
    .description("추가 워크플로를 활성화합니다")
    .option("-t, --target <path>", "대상 레포 경로", process.cwd())
    .action((names, opts) => {
      const rootDir = path.resolve(opts.target);
      const state = loadState(rootDir);

      if (!state) {
        console.log(chalk.red("상태 파일을 찾을 수 없습니다."));
        process.exit(1);
      }

      const templatesDir = getTemplatesDir();
      const added: string[] = [];

      for (const name of names) {
        const templatePath = path.join(templatesDir, "workflows", `${name}.md`);
        if (!fs.existsSync(templatePath)) {
          console.log(chalk.yellow(`워크플로 템플릿 없음: ${name}`));
          continue;
        }

        const outPath = path.join(rootDir, ".hatchery", "workflows", `${name}.md`);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.copyFileSync(templatePath, outPath);
        added.push(name);
      }

      if (added.length > 0) {
        console.log(chalk.green(`\n✓ 워크플로 추가: ${added.join(", ")}`));
        console.log(chalk.gray("state.json의 workflows에 수동으로 추가하거나 'hatchery render'를 실행하세요.\n"));
      }
    });
}
