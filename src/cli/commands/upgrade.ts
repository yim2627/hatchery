import { Command } from "commander";
import path from "node:path";
import chalk from "chalk";
import { loadState, updateState } from "../../state/index.js";
import { loadProfile } from "../../generator/index.js";
import type { ProfileName } from "../../types/index.js";

const PROFILE_ORDER: ProfileName[] = ["basic", "intermediate", "advanced"];

export function registerUpgrade(program: Command) {
  program
    .command("upgrade")
    .description("프로필을 업그레이드합니다")
    .requiredOption("--to <profile>", "목표 프로필 (basic/intermediate/advanced)")
    .option("-t, --target <path>", "대상 레포 경로", process.cwd())
    .action(async (opts) => {
      const rootDir = path.resolve(opts.target);
      const state = loadState(rootDir);

      if (!state) {
        console.log(chalk.red("상태 파일을 찾을 수 없습니다. 먼저 'hatchery onboard'를 실행하세요."));
        process.exit(1);
      }

      const targetProfile = opts.to as ProfileName;
      if (!PROFILE_ORDER.includes(targetProfile)) {
        console.log(chalk.red(`유효하지 않은 프로필: ${targetProfile}`));
        console.log(`사용 가능: ${PROFILE_ORDER.join(", ")}`);
        process.exit(1);
      }

      const currentIdx = PROFILE_ORDER.indexOf(state.profile);
      const targetIdx = PROFILE_ORDER.indexOf(targetProfile);

      if (targetIdx === currentIdx) {
        console.log(chalk.yellow(`이미 ${targetProfile} 프로필입니다.`));
        return;
      }

      const direction = targetIdx > currentIdx ? "업그레이드" : "다운그레이드";
      const profile = loadProfile(targetProfile);

      // 새 프로필의 기본 스킬을 기존 스킬에 병합
      const mergedSkills = [...new Set([...state.skills, ...profile.default_skills])].sort();

      const updated = updateState(rootDir, {
        profile: targetProfile,
        skills: mergedSkills,
      });

      console.log(chalk.green(`\n✓ 프로필 ${direction}: ${state.profile} → ${targetProfile}`));
      console.log(`  스킬: ${updated.skills.join(", ")}`);
      console.log(chalk.gray(`\n'hatchery render'로 컨텍스트를 재생성하세요.\n`));
    });
}
