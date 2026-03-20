import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { loadState, updateState } from "../../state/index.js";

const SPECS_DIR = ".hatchery/specs";

export function registerSpec(program: Command) {
  const spec = program.command("spec").description("프로젝트 기획서/스펙 문서 관리");

  spec
    .command("add <file>")
    .description("기획서를 .hatchery/specs/에 등록합니다")
    .option("-t, --target <path>", "대상 레포 경로", process.cwd())
    .action((file, opts) => {
      const rootDir = path.resolve(opts.target);
      const sourcePath = path.resolve(file);

      if (!fs.existsSync(sourcePath)) {
        console.error(chalk.red(`파일을 찾을 수 없습니다: ${sourcePath}`));
        process.exit(1);
      }

      const state = loadState(rootDir);
      if (!state) {
        console.error(chalk.red("온보딩이 필요합니다. 먼저 'hatchery onboard'를 실행하세요."));
        process.exit(1);
      }

      const specsDir = path.join(rootDir, SPECS_DIR);
      fs.mkdirSync(specsDir, { recursive: true });

      const fileName = path.basename(sourcePath);
      const destPath = path.join(specsDir, fileName);
      fs.copyFileSync(sourcePath, destPath);

      const specs = state.specs ?? [];
      if (!specs.includes(fileName)) {
        specs.push(fileName);
        updateState(rootDir, { specs });
      }

      console.log(chalk.green(`\n✓ 스펙 등록: ${fileName}`));
      console.log(`  경로: ${SPECS_DIR}/${fileName}`);
      console.log(chalk.gray(`\n'hatchery render'로 context.md에 반영하세요.\n`));
    });

  spec
    .command("list")
    .description("등록된 스펙 목록")
    .option("-t, --target <path>", "대상 레포 경로", process.cwd())
    .action((opts) => {
      const rootDir = path.resolve(opts.target);
      const state = loadState(rootDir);

      if (!state) {
        console.error(chalk.red("온보딩이 필요합니다. 먼저 'hatchery onboard'를 실행하세요."));
        process.exit(1);
      }

      const specs = state.specs ?? [];
      if (specs.length === 0) {
        console.log(chalk.gray("\n등록된 스펙이 없습니다.\n"));
        return;
      }

      console.log(chalk.bold("\n등록된 스펙:"));
      for (const s of specs) {
        const specsPath = path.join(rootDir, SPECS_DIR, s);
        const exists = fs.existsSync(specsPath);
        const size = exists ? `${Math.ceil(fs.statSync(specsPath).size / 1024)}KB` : "파일 없음";
        const status = exists ? chalk.green(size) : chalk.red(size);
        console.log(`  ${chalk.cyan(s)} ${chalk.gray(`(${status})`)}`);
      }
      console.log();
    });

  spec
    .command("remove <name>")
    .description("스펙을 제거합니다")
    .option("-t, --target <path>", "대상 레포 경로", process.cwd())
    .action((name, opts) => {
      const rootDir = path.resolve(opts.target);
      const state = loadState(rootDir);

      if (!state) {
        console.error(chalk.red("온보딩이 필요합니다. 먼저 'hatchery onboard'를 실행하세요."));
        process.exit(1);
      }

      const specs = state.specs ?? [];
      if (!specs.includes(name)) {
        console.error(chalk.red(`등록되지 않은 스펙입니다: ${name}`));
        process.exit(1);
      }

      // state에서 제거
      updateState(rootDir, { specs: specs.filter((s) => s !== name) });

      // 파일 삭제
      const filePath = path.join(rootDir, SPECS_DIR, name);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      console.log(chalk.green(`\n✓ 스펙 제거: ${name}\n`));
    });
}
