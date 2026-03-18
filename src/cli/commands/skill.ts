import { Command } from "commander";
import path from "node:path";
import chalk from "chalk";
import { listBuiltinSkills, listCustomSkills, createCustomSkill } from "../../generator/skill-composer.js";

export function registerSkill(program: Command) {
  const skill = program.command("skill").description("스킬 관리");

  skill
    .command("list")
    .description("사용 가능한 스킬 목록")
    .option("-t, --target <path>", "대상 레포 경로", process.cwd())
    .action((opts) => {
      const rootDir = path.resolve(opts.target);

      console.log(chalk.bold("\n빌트인 스킬:"));
      const builtins = listBuiltinSkills();
      for (const s of builtins) {
        const platforms = s.platforms.length > 0 ? chalk.gray(` (${s.platforms.join(", ")})`) : "";
        console.log(`  ${chalk.cyan(s.name)}${platforms}`);
      }

      const customs = listCustomSkills(rootDir);
      if (customs.length > 0) {
        console.log(chalk.bold("\n커스텀 스킬:"));
        for (const s of customs) {
          const platforms = s.platforms.length > 0 ? chalk.gray(` (${s.platforms.join(", ")})`) : "";
          console.log(`  ${chalk.yellow(s.name)}${platforms}`);
        }
      }

      console.log();
    });

  skill
    .command("create <name>")
    .description("커스텀 스킬을 생성합니다")
    .option("--from <skill>", "기존 빌트인 스킬을 기반으로 생성")
    .option("-t, --target <path>", "대상 레포 경로", process.cwd())
    .action((name, opts) => {
      const rootDir = path.resolve(opts.target);
      const createdDir = createCustomSkill(rootDir, name, opts.from);

      console.log(chalk.green(`\n✓ 커스텀 스킬 생성: ${name}`));
      console.log(`  경로: ${path.relative(rootDir, createdDir)}`);
      if (opts.from) {
        console.log(`  기반: ${opts.from}`);
      }
      console.log(chalk.gray(`\n_base.md를 편집한 후 'hatchery render'로 반영하세요.\n`));
    });
}
