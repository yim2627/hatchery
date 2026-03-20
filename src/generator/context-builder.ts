import fs from "node:fs";
import path from "node:path";
import type { HatcheryState, TemplateContext } from "../types/index.js";
import { renderTemplateFile, getTemplatesDir } from "./renderer.js";
import { composeSkill } from "./skill-composer.js";
import { entriesToContext } from "../journal/index.js";

// 워크플로별 핵심 절차 (CLAUDE.md 인라인용)
export const WORKFLOW_STEPS: Record<string, { name: string; trigger: string; steps: string[] }> = {
  "add-feature": {
    name: "기능 추가",
    trigger: "새 기능을 추가하거나 기존 플로우를 확장할 때",
    steps: [
      "영향 받는 영역의 기존 코드를 먼저 읽는다",
      "도메인 → 데이터 → UI 순서로 구현한다",
      "비자명한 로직에 테스트를 추가한다",
    ],
  },
  "fix-bug": {
    name: "버그 수정",
    trigger: "버그, 크래시, 회귀를 수정할 때",
    steps: [
      "재현 경로를 확인한다",
      "원인을 찾아 최소 범위로 수정한다",
      "회귀 테스트를 추가한다",
    ],
  },
  "refactor": {
    name: "리팩토링",
    trigger: "동작 변경 없이 구조를 개선할 때",
    steps: [
      "변경 전 동작을 테스트로 확인한다",
      "구조만 변경하고 동작은 유지한다",
    ],
  },
  "review": {
    name: "코드 리뷰",
    trigger: "코드 리뷰를 수행할 때",
    steps: [
      "스킬 규칙과 대조한다",
      "CRITICAL → WARNING → INFO 순으로 분류한다",
    ],
  },
  "build": {
    name: "빌드 검증",
    trigger: "빌드 실패를 해결하거나 배포할 때",
    steps: [
      "빌드/테스트 명령을 실행한다",
      "실패 시 첫 번째 에러를 추출한다",
    ],
  },
  "verify": {
    name: "분석 검증",
    trigger: "분석 결과를 확인할 때",
    steps: [
      "config.json 감지 결과가 실제와 일치하는지 확인한다",
      "빌드·테스트 명령이 동작하는지 확인한다",
    ],
  },
};

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

export function buildWorkflowInline(workflows: string[]): string {
  return workflows.map((w) => {
    const info = WORKFLOW_STEPS[w];
    if (!info) return `**${w}**\n  상세: \`.hatchery/workflows/${w}.md\``;
    const stepsStr = info.steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n");
    return `**${info.name}** — ${info.trigger}\n${stepsStr}\n  상세: \`.hatchery/workflows/${w}.md\``;
  }).join("\n\n");
}

export function buildSpecSection(specs: string[]): string {
  if (!specs || specs.length === 0) return "";
  const specLines = specs.map((s) => `- \`.hatchery/specs/${s}\``).join("\n");
  return `2. 프로젝트 기획서/스펙 문서를 읽는다:\n${specLines}\n\n`;
}

export function buildSkillDescriptions(skills: string[], ctx: TemplateContext): string {
  return skills.map((s) => {
    const descFn = SKILL_DESC[s];
    const desc = descFn ? descFn(ctx) : s;
    return `- \`.hatchery/skills/${s}.md\` — ${desc}`;
  }).join("\n");
}

interface ContextOptions {
  rootDir: string;
  state: HatcheryState;
  context: TemplateContext;
  workflow?: string;
  maxTokens?: number;
  includeJournal?: number; // last N journal entries
}

/**
 * context 변수에 SKILL_DESCRIPTIONS, WORKFLOW_INLINE이 없으면 자동 보정한다.
 * render 커맨드 경로에서 buildQuickContext가 이 변수를 생성하지 않기 때문.
 */
function enrichContext(context: TemplateContext, state: HatcheryState): TemplateContext {
  const enriched = { ...context };
  if (!enriched.SKILL_DESCRIPTIONS) {
    enriched.SKILL_DESCRIPTIONS = buildSkillDescriptions(state.skills, enriched);
  }
  if (!enriched.WORKFLOW_INLINE) {
    enriched.WORKFLOW_INLINE = buildWorkflowInline(state.workflows);
  }
  if (!enriched.SPEC_SECTION) {
    enriched.SPEC_SECTION = buildSpecSection(state.specs ?? []);
  }
  return enriched;
}

/**
 * 전체 rendered_context.md를 생성한다.
 */
export function buildContext(opts: ContextOptions): string {
  const { rootDir, state, context, workflow, maxTokens, includeJournal } = opts;
  const templatesDir = getTemplatesDir();
  const sections: string[] = [];

  // context 변수 보정 (SKILL_DESCRIPTIONS, WORKFLOW_INLINE)
  const enrichedCtx = enrichContext(context, state);

  // 1. CLAUDE.md
  const claudePath = path.join(templatesDir, "CLAUDE.md");
  if (fs.existsSync(claudePath)) {
    sections.push(wrapSection("CLAUDE.md", renderTemplateFile(claudePath, enrichedCtx)));
  }

  // 2. 스킬 — 워크플로 기반 필터링
  const skills = workflow ? filterSkillsByWorkflow(state.skills, workflow) : state.skills;
  const primaryPlatform = state.platforms[0] ?? "universal";

  for (const skill of skills) {
    const composed = composeSkill(skill, primaryPlatform, enrichedCtx, rootDir);
    sections.push(wrapSection(`skills/${skill}.md`, composed));
  }

  // 3. 워크플로
  if (workflow) {
    const wfPath = path.join(templatesDir, "workflows", `${workflow}.md`);
    if (fs.existsSync(wfPath)) {
      sections.push(wrapSection(`workflows/${workflow}.md`, renderTemplateFile(wfPath, enrichedCtx)));
    }
  } else {
    for (const wf of state.workflows) {
      const wfPath = path.join(templatesDir, "workflows", `${wf}.md`);
      if (fs.existsSync(wfPath)) {
        sections.push(wrapSection(`workflows/${wf}.md`, renderTemplateFile(wfPath, enrichedCtx)));
      }
    }
  }

  // 4. 스펙 문서 번들링
  const specs = state.specs ?? [];
  for (const specFile of specs) {
    const specPath = path.join(rootDir, ".hatchery", "specs", specFile);
    if (fs.existsSync(specPath)) {
      const specContent = fs.readFileSync(specPath, "utf-8");
      sections.push(wrapSection(`spec: ${specFile}`, specContent));
    }
  }

  // 5. Task Journal (선택)
  if (includeJournal && includeJournal > 0) {
    const journalCtx = entriesToContext(rootDir, includeJournal);
    if (journalCtx) {
      sections.push(wrapSection("journal", journalCtx));
    }
  }

  let result = buildHeader(state) + "\n\n" + sections.join("\n\n");

  // 5. 토큰 예산 트리밍 (대략적 추정: 1 토큰 ≈ 4 chars)
  if (maxTokens) {
    const charBudget = maxTokens * 4;
    if (result.length > charBudget) {
      result = trimToTokenBudget(result, sections, charBudget, state);
    }
  }

  return result;
}

function buildHeader(state: HatcheryState): string {
  return [
    "# Rendered AI Harness Context",
    "",
    `Profile: ${state.profile}`,
    "",
    `Platforms: ${state.platforms.join(", ")}`,
    "",
    `Skills: ${state.skills.join(", ")}`,
    "",
    `Workflows: ${state.workflows.join(", ")}`,
  ].join("\n");
}

function wrapSection(label: string, content: string): string {
  return `<!-- ${label} -->\n\n${content}`;
}

/**
 * 워크플로에 따라 관련 스킬을 우선 필터링한다.
 * add-feature / fix-bug → 전체 스킬 유지
 * refactor → architecture, testing 우선
 * build → 최소 (architecture만)
 */
function filterSkillsByWorkflow(skills: string[], workflow: string): string[] {
  const priorityMap: Record<string, string[]> = {
    refactor: ["architecture", "testing"],
    build: ["architecture"],
    review: skills, // 전체
  };

  const priority = priorityMap[workflow];
  if (!priority) return skills; // add-feature, fix-bug 등은 전체

  // priority에 있는 것 우선, 나머지도 포함
  return [...priority.filter((s) => skills.includes(s)), ...skills.filter((s) => !priority.includes(s))];
}

/**
 * 토큰 예산을 초과하면 우선순위가 낮은 섹션부터 제거한다.
 * 순서: journal → workflows → 비핵심 skills → core skills → rules → agents
 */
function trimToTokenBudget(
  _fullResult: string,
  sections: string[],
  charBudget: number,
  state: HatcheryState,
): string {
  const header = buildHeader(state);
  let result = header;

  // 섹션을 우선순위 역순으로 추가하다가 예산 초과 시 중단
  for (const section of sections) {
    if ((result + "\n\n" + section).length > charBudget) {
      result += "\n\n<!-- 토큰 예산 초과로 이후 섹션 생략 -->";
      break;
    }
    result += "\n\n" + section;
  }

  return result;
}
