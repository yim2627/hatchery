import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { loadState } from "../../state/index.js";
import { buildContext, buildSpecSection } from "../../generator/context-builder.js";
import { renderTemplateFile, getTemplatesDir } from "../../generator/renderer.js";
import { loadProfile } from "../../generator/index.js";
import type { ProjectConfig, TemplateContext } from "../../types/index.js";

export function registerRender(program: Command) {
  program
    .command("render")
    .description("rendered_context.md를 재생성합니다")
    .option("-t, --target <path>", "대상 레포 경로", process.cwd())
    .option("-w, --workflow <name>", "특정 워크플로에 집중한 컨텍스트 생성")
    .option("--max-tokens <n>", "토큰 예산 제한", parseInt)
    .option("--journal <n>", "최근 N개 Task Journal 포함", parseInt)
    .option("--workspace <path>", "모노레포 워크스페이스 경로")
    .action(async (opts) => {
      const rootDir = path.resolve(opts.target);
      const state = loadState(rootDir, opts.workspace);

      if (!state) {
        console.log(chalk.red("상태 파일을 찾을 수 없습니다. 먼저 'hatchery onboard'를 실행하세요."));
        process.exit(1);
      }

      const configPath = path.join(rootDir, state.configPath);
      if (!fs.existsSync(configPath)) {
        console.log(chalk.red(`설정 파일을 찾을 수 없습니다: ${state.configPath}`));
        process.exit(1);
      }

      const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as ProjectConfig;
      const profile = loadProfile(state.profile);
      const ctx = buildQuickContext(config, state, profile);

      const rendered = buildContext({
        rootDir,
        state,
        context: ctx,
        workflow: opts.workflow,
        maxTokens: opts.maxTokens,
        includeJournal: opts.journal,
      });

      const outPath = opts.workspace
        ? path.join(rootDir, ".hatchery", "workspaces", opts.workspace, "context.md")
        : path.join(rootDir, ".hatchery", "context.md");

      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, rendered);

      // CLAUDE.md도 재생성 (스펙 섹션 반영)
      const claudeTemplatePath = path.join(getTemplatesDir(), "CLAUDE.md");
      if (fs.existsSync(claudeTemplatePath)) {
        const claudeMd = renderTemplateFile(claudeTemplatePath, ctx);
        fs.writeFileSync(path.join(rootDir, "CLAUDE.md"), claudeMd);
      }

      const tokenEstimate = Math.round(rendered.length / 4);
      console.log(chalk.green(`✓ 컨텍스트 재생성 완료: ${path.relative(rootDir, outPath)}`));
      console.log(`  토큰 추정: ~${tokenEstimate.toLocaleString()}`);
      if (opts.workflow) {
        console.log(`  워크플로 필터: ${opts.workflow}`);
      }
      console.log();
    });
}

function buildQuickContext(config: ProjectConfig, state: any, profile: any): TemplateContext {
  return {
    PROJECT_NAME: config.project_name,
    PLATFORMS: state.platforms.join(", "),
    UI_FRAMEWORK: config.ui_framework,
    ARCHITECTURE_STYLE: config.architecture_style,
    MIN_VERSION: config.min_version,
    PACKAGE_MANAGER: config.package_manager,
    PROJECT_GENERATOR: config.project_generator,
    TEST_FRAMEWORK: config.test_framework,
    LINT_TOOLS: config.lint_tools,
    NETWORK_LAYER_NAME: config.network_layer_name,
    PERSISTENCE_LAYER_NAME: config.persistence_layer_name,
    LOGGING_SYSTEM: config.logging_system,
    PRIVACY_REQUIREMENTS: config.privacy_requirements,
    PREFERRED_FILE_LINE_LIMIT: config.preferred_file_line_limit,
    BUILD_COMMAND: config.build_command || "설정되지 않음",
    TEST_COMMAND: config.test_command || "설정되지 않음",
    HARNESS_PROFILE: state.profile,
    SELECTED_SKILLS: state.skills.join(", "),
    SELECTED_SKILLS_BULLETS: state.skills.map((s: string) => `- \`${s}\``).join("\n"),
    WORKFLOW_ROUTING: state.workflows.map((w: string) => `- \`${w}\``).join("\n"),
    WORKFLOW_LIST: state.workflows.map((w: string) => `- \`${w}\``).join("\n"),
    PROFILE_GUIDANCE: profile.guidance ?? "",
    SPEC_SECTION: buildSpecSection(state.specs ?? []),
  };
}
