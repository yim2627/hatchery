import fs from "node:fs";
import path from "node:path";
import type { PlatformId, SkillDefinition, TemplateContext } from "../types/index.js";
import { renderTemplate, getTemplatesDir } from "./renderer.js";

const BUILTIN_SKILLS = [
  "architecture",
  "ui-rules",
  "concurrency",
  "networking",
  "testing",
  "state-management",
  "accessibility",
  "logging",
];

export function listBuiltinSkills(): SkillDefinition[] {
  const templatesDir = getTemplatesDir();
  const skillsDir = path.join(templatesDir, "skills");

  return BUILTIN_SKILLS.map((name) => {
    const skillDir = path.join(skillsDir, name);
    const platforms: PlatformId[] = [];

    if (fs.existsSync(skillDir)) {
      for (const entry of fs.readdirSync(skillDir, { withFileTypes: true })) {
        if (entry.isDirectory()) continue; // references/ 등 디렉토리 무시
        if (entry.name === "_base.md") continue;
        if (!entry.name.endsWith(".md")) continue;
        const platform = entry.name.replace(".md", "") as PlatformId;
        platforms.push(platform);
      }
    }

    return { name, builtin: true, platforms };
  });
}

export function listCustomSkills(rootDir: string): SkillDefinition[] {
  const customDir = path.join(rootDir, "templates", "skills", "custom");
  if (!fs.existsSync(customDir)) return [];

  return fs
    .readdirSync(customDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const skillDir = path.join(customDir, d.name);
      const platforms: PlatformId[] = [];

      for (const file of fs.readdirSync(skillDir)) {
        if (file === "_base.md") continue;
        if (file.endsWith(".md")) {
          platforms.push(file.replace(".md", "") as PlatformId);
        }
      }

      return { name: d.name, builtin: false, platforms };
    });
}

export function composeSkill(
  skillName: string,
  platform: PlatformId,
  context: TemplateContext,
  rootDir?: string,
): string {
  const templatesDir = getTemplatesDir();
  const sections: string[] = [];

  // 1. Load base
  const baseContent = loadSkillFile(templatesDir, skillName, "_base.md", rootDir);
  if (baseContent) {
    sections.push(renderTemplate(baseContent, context));
  }

  // 2. Load platform-specific
  const platformContent = loadSkillFile(templatesDir, skillName, `${platform}.md`, rootDir);
  if (platformContent) {
    sections.push(renderTemplate(platformContent, context));
  }

  // 3. Reference index — 레퍼런스가 있으면 목록을 안내
  const refs = listReferences(templatesDir, skillName, platform, rootDir);
  if (refs.length > 0) {
    const refSection = [
      "## 참조 문서",
      "",
      "이 스킬의 상세 패턴·안티패턴·코드 예시가 아래 파일에 있다.",
      "관련 작업 시 해당 참조를 읽는다.",
      "",
      ...refs.map((r) => `- \`.hatchery/skills/references/${skillName}/${r}\``),
    ].join("\n");
    sections.push(refSection);
  }

  if (sections.length === 0) {
    return `# ${skillName}\n\n이 플랫폼(${platform})에 대한 규칙이 정의되지 않았습니다.\n`;
  }

  return sections.join("\n\n---\n\n");
}

/**
 * 스킬의 references/ 디렉토리에서 해당 플랫폼의 참조 파일 목록을 반환한다.
 */
function listReferences(
  templatesDir: string,
  skillName: string,
  platform: PlatformId,
  rootDir?: string,
): string[] {
  const refs: string[] = [];
  const candidates = [
    rootDir ? path.join(rootDir, "templates", "skills", "custom", skillName, "references", platform) : null,
    path.join(templatesDir, "skills", skillName, "references", platform),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
      for (const f of files) {
        if (!refs.includes(f)) refs.push(f);
      }
    }
  }

  return refs.sort();
}

function loadSkillFile(
  templatesDir: string,
  skillName: string,
  fileName: string,
  rootDir?: string,
): string | null {
  // Try custom first (in target repo)
  if (rootDir) {
    const customPath = path.join(rootDir, "templates", "skills", "custom", skillName, fileName);
    if (fs.existsSync(customPath)) {
      return fs.readFileSync(customPath, "utf-8");
    }
  }

  // Then builtin
  const builtinPath = path.join(templatesDir, "skills", skillName, fileName);
  if (fs.existsSync(builtinPath)) {
    return fs.readFileSync(builtinPath, "utf-8");
  }

  return null;
}

export function createCustomSkill(
  rootDir: string,
  skillName: string,
  fromSkill?: string,
): string {
  const customDir = path.join(rootDir, "templates", "skills", "custom", skillName);
  fs.mkdirSync(customDir, { recursive: true });

  if (fromSkill) {
    // Copy from existing builtin
    const templatesDir = getTemplatesDir();
    const sourceDir = path.join(templatesDir, "skills", fromSkill);

    if (fs.existsSync(sourceDir)) {
      for (const file of fs.readdirSync(sourceDir)) {
        if (file.endsWith(".md")) {
          const content = fs.readFileSync(path.join(sourceDir, file), "utf-8");
          const newContent = content.replace(
            new RegExp(fromSkill, "gi"),
            skillName,
          );
          fs.writeFileSync(path.join(customDir, file), newContent);
        }
      }
    }
  } else {
    // Create empty base template
    const baseMd = `# ${skillName}

Apply this skill whenever [describe when this skill applies].

## Rules

- [Add your rules here]
`;
    fs.writeFileSync(path.join(customDir, "_base.md"), baseMd);
  }

  return customDir;
}
