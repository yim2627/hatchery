import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type {
  HatcheryState,
  ProjectConfig,
  ProfileName,
  PlatformId,
  TemplateContext,
  Profile,
} from "../types/index.js";
import { renderTemplateFile, getTemplatesDir, getProfilesDir } from "./renderer.js";
import { composeSkill } from "./skill-composer.js";
import { buildContext, buildWorkflowInline, buildSkillDescriptions } from "./context-builder.js";
import { createInitialState, saveState } from "../state/index.js";


export interface GenerateOptions {
  rootDir: string;
  config: ProjectConfig;
  profile: ProfileName;
  skills: string[];
  workflows: string[];
  platforms: PlatformId[];
}

export interface GenerateResult {
  state: HatcheryState;
  filesCreated: string[];
}

export function loadProfile(profileName: ProfileName): Profile {
  const profilesDir = getProfilesDir();
  const filePath = path.join(profilesDir, `${profileName}.yaml`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`프로필을 찾을 수 없습니다: ${profileName}`);
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return YAML.parse(content) as Profile;
}

export function generate(opts: GenerateOptions): GenerateResult {
  const { rootDir, config, profile: profileName, skills, workflows, platforms } = opts;
  const templatesDir = getTemplatesDir();
  const profile = loadProfile(profileName);
  const filesCreated: string[] = [];

  const ctx = buildTemplateContext(config, profileName, skills, workflows, platforms, profile, rootDir);

  // 1. CLAUDE.md — Claude Code가 읽는 단일 진입점
  const claudeMd = renderTemplateFile(path.join(templatesDir, "CLAUDE.md"), ctx);
  writeOutput(rootDir, "CLAUDE.md", claudeMd);
  filesCreated.push("CLAUDE.md");

  // 2. .hatchery/config.json — 자동 분석 결과 (사람이 아닌 코드가 채운 설정)
  writeOutput(rootDir, ".hatchery/config.json", JSON.stringify(config, null, 2) + "\n");
  filesCreated.push(".hatchery/config.json");

  // 3. .hatchery/skills/ — base + platform 합성 스킬
  const primaryPlatform = platforms[0] ?? "universal";
  for (const skill of skills) {
    const composed = composeSkill(skill, primaryPlatform, ctx, rootDir);
    writeOutput(rootDir, `.hatchery/skills/${skill}.md`, composed);
    filesCreated.push(`.hatchery/skills/${skill}.md`);

    // 레퍼런스 파일 복사
    const refDir = path.join(templatesDir, "skills", skill, "references", primaryPlatform);
    if (fs.existsSync(refDir)) {
      for (const file of fs.readdirSync(refDir).filter((f) => f.endsWith(".md"))) {
        const content = fs.readFileSync(path.join(refDir, file), "utf-8");
        writeOutput(rootDir, `.hatchery/skills/references/${skill}/${file}`, content);
        filesCreated.push(`.hatchery/skills/references/${skill}/${file}`);
      }
    }
  }

  // 4. .hatchery/workflows/
  for (const wf of workflows) {
    const wfTemplatePath = path.join(templatesDir, "workflows", `${wf}.md`);
    if (fs.existsSync(wfTemplatePath)) {
      writeOutput(rootDir, `.hatchery/workflows/${wf}.md`, renderTemplateFile(wfTemplatePath, ctx));
      filesCreated.push(`.hatchery/workflows/${wf}.md`);
    }
  }

  // 5. .hatchery/state.json
  const state = createInitialState({
    profile: profileName,
    skills,
    workflows,
    platforms,
    configPath: ".hatchery/config.json",
  });
  saveState(rootDir, state);
  filesCreated.push(".hatchery/state.json");

  // 6. .hatchery/context.md — 동적 에이전트 컨텍스트
  const renderedContext = buildContext({ rootDir, state, context: ctx });
  writeOutput(rootDir, ".hatchery/context.md", renderedContext);
  filesCreated.push(".hatchery/context.md");

  return { state, filesCreated };
}


function buildTemplateContext(
  config: ProjectConfig,
  profileName: ProfileName,
  skills: string[],
  workflows: string[],
  platforms: PlatformId[],
  profile: Profile,
  _rootDir?: string,
): TemplateContext {
  const ctx: TemplateContext = {
    PROJECT_NAME: config.project_name,
    PLATFORMS: platforms.join(", "),
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
    HARNESS_PROFILE: profileName,
    SELECTED_SKILLS: skills.join(", "),
    PROFILE_GUIDANCE: profile.guidance ?? "",
  };

  // 스킬 설명 생성
  ctx.SKILL_DESCRIPTIONS = buildSkillDescriptions(skills, ctx);

  // 워크플로 인라인 절차 생성
  ctx.WORKFLOW_INLINE = buildWorkflowInline(workflows);

  return ctx;
}

function writeOutput(rootDir: string, relativePath: string, content: string): void {
  const fullPath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}
