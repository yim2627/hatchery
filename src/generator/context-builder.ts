import fs from "node:fs";
import path from "node:path";
import type { HatcheryState, TemplateContext } from "../types/index.js";
import { renderTemplateFile, getTemplatesDir } from "./renderer.js";
import { composeSkill } from "./skill-composer.js";
import { entriesToContext } from "../journal/index.js";

interface ContextOptions {
  rootDir: string;
  state: HatcheryState;
  context: TemplateContext;
  workflow?: string;
  maxTokens?: number;
  includeJournal?: number; // last N journal entries
}

/**
 * 전체 rendered_context.md를 생성한다.
 */
export function buildContext(opts: ContextOptions): string {
  const { rootDir, state, context, workflow, maxTokens, includeJournal } = opts;
  const templatesDir = getTemplatesDir();
  const sections: string[] = [];

  // 1. CLAUDE.md
  const claudePath = path.join(templatesDir, "CLAUDE.md");
  if (fs.existsSync(claudePath)) {
    sections.push(wrapSection("CLAUDE.md", renderTemplateFile(claudePath, context)));
  }

  // 2. 스킬 — 워크플로 기반 필터링
  const skills = workflow ? filterSkillsByWorkflow(state.skills, workflow) : state.skills;
  const primaryPlatform = state.platforms[0] ?? "universal";

  for (const skill of skills) {
    const composed = composeSkill(skill, primaryPlatform, context, rootDir);
    sections.push(wrapSection(`skills/${skill}.md`, composed));
  }

  // 4. 워크플로
  if (workflow) {
    const wfPath = path.join(templatesDir, "workflows", `${workflow}.md`);
    if (fs.existsSync(wfPath)) {
      sections.push(wrapSection(`workflows/${workflow}.md`, renderTemplateFile(wfPath, context)));
    }
  } else {
    for (const wf of state.workflows) {
      const wfPath = path.join(templatesDir, "workflows", `${wf}.md`);
      if (fs.existsSync(wfPath)) {
        sections.push(wrapSection(`workflows/${wf}.md`, renderTemplateFile(wfPath, context)));
      }
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

  // 6. 토큰 예산 트리밍 (대략적 추정: 1 토큰 ≈ 4 chars)
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
