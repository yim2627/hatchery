import fs from "node:fs";
import path from "node:path";
import type { TemplateContext } from "../types/index.js";

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

export function renderTemplate(templateContent: string, context: TemplateContext): string {
  return templateContent.replace(PLACEHOLDER_RE, (_match, key: string) => {
    const value = context[key];
    if (value === undefined) return `{{${key}}}`;
    if (Array.isArray(value)) return value.map((v) => `- \`${v}\``).join("\n");
    return String(value);
  });
}

export function renderTemplateFile(templatePath: string, context: TemplateContext): string {
  const content = fs.readFileSync(templatePath, "utf-8");
  return renderTemplate(content, context);
}

export function getTemplatesDir(): string {
  // In development: relative to project root
  // In npm package: relative to dist/
  const candidates = [
    path.resolve(import.meta.dirname ?? __dirname, "../../templates"),
    path.resolve(import.meta.dirname ?? __dirname, "../templates"),
    path.resolve(process.cwd(), "templates"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error("Could not locate templates directory");
}

export function getProfilesDir(): string {
  const candidates = [
    path.resolve(import.meta.dirname ?? __dirname, "../../profiles"),
    path.resolve(import.meta.dirname ?? __dirname, "../profiles"),
    path.resolve(process.cwd(), "profiles"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error("Could not locate profiles directory");
}
