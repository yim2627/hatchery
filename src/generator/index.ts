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
import { buildContext } from "./context-builder.js";
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

// 스킬별 한줄 설명 매핑
const SKILL_DESC: Record<string, (ctx: TemplateContext) => string> = {
  "architecture": (ctx) => `레이어 분리, 의존성 방향, ${ctx.ARCHITECTURE_STYLE} 패턴 유지`,
  "ui-rules": (ctx) => `${ctx.UI_FRAMEWORK} 컴포넌트 규칙, Property Wrapper 선택`,
  "concurrency": () => "async/await, actor 격리, 데드락 방지",
  "networking": (ctx) => `${ctx.NETWORK_LAYER_NAME} 기반 API 설계, 에러 처리`,
  "testing": (ctx) => `${ctx.TEST_FRAMEWORK} 테스트 전략, 모킹`,
  "state-management": (ctx) => `${ctx.PERSISTENCE_LAYER_NAME} 사용 규칙, 전역 상태 관리`,
  "accessibility": () => "접근성 규칙, VoiceOver, Dynamic Type",
  "logging": (ctx) => `${ctx.LOGGING_SYSTEM} 로깅 전략, 구조화 로깅`,
};

// 워크플로별 트리거 조건 + 한줄 설명
const WORKFLOW_DESC: Record<string, string> = {
  "add-feature": "새 기능을 추가하거나 기존 플로우를 확장할 때. 도메인→데이터→UI 순서",
  "fix-bug": "버그, 크래시, 회귀를 수정할 때. 재현→원인→수정→회귀 테스트",
  "refactor": "동작 변경 없이 구조를 개선할 때",
  "review": "코드 리뷰를 수행할 때. 아키텍처·보안·성능 관점",
  "build": "빌드 실패를 해결하거나 배포할 때",
  "verify": "테스트 실행 또는 규칙 준수를 확인할 때",
};

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
  ctx.SKILL_DESCRIPTIONS = skills.map((s) => {
    const descFn = SKILL_DESC[s];
    const desc = descFn ? descFn(ctx) : s;
    return `- \`.hatchery/skills/${s}.md\` — ${desc}`;
  }).join("\n");

  // 워크플로 설명 생성
  ctx.WORKFLOW_DESCRIPTIONS = workflows.map((w) => {
    const desc = WORKFLOW_DESC[w] ?? w;
    return `- \`.hatchery/workflows/${w}.md\` — ${desc}`;
  }).join("\n");

  return ctx;
}

function writeOutput(rootDir: string, relativePath: string, content: string): void {
  const fullPath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}
