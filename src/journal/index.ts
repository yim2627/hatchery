import fs from "node:fs";
import path from "node:path";
import type { JournalEntry } from "../types/index.js";

const JOURNAL_DIR = ".hatchery/journal";

function getJournalDir(rootDir: string): string {
  return path.join(rootDir, JOURNAL_DIR);
}

export function logEntry(rootDir: string, message: string, meta?: Partial<JournalEntry>): JournalEntry {
  const dir = getJournalDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });

  const now = new Date();
  const id = formatEntryId(now, message);
  const entry: JournalEntry = {
    id,
    timestamp: now.toISOString(),
    message,
    ...meta,
  };

  const filePath = path.join(dir, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2) + "\n");

  return entry;
}

export function listEntries(rootDir: string, limit?: number): JournalEntry[] {
  const dir = getJournalDir(rootDir);
  if (!fs.existsSync(dir)) return [];

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();

  const sliced = limit ? files.slice(0, limit) : files;

  return sliced.map((f) => {
    const content = fs.readFileSync(path.join(dir, f), "utf-8");
    return JSON.parse(content) as JournalEntry;
  });
}

export function getEntry(rootDir: string, id: string): JournalEntry | null {
  const filePath = path.join(getJournalDir(rootDir), `${id}.json`);
  if (!fs.existsSync(filePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as JournalEntry;
  } catch {
    return null;
  }
}

export function entriesToContext(rootDir: string, lastN: number): string {
  const entries = listEntries(rootDir, lastN);
  if (entries.length === 0) return "";

  const lines = ["## Recent Task History", ""];
  for (const entry of entries) {
    const date = entry.timestamp.split("T")[0];
    lines.push(`- **${date}**: ${entry.message}`);
    if (entry.filesChanged?.length) {
      lines.push(`  - Files: ${entry.filesChanged.join(", ")}`);
    }
    if (entry.workflow) {
      lines.push(`  - Workflow: ${entry.workflow}`);
    }
  }

  return lines.join("\n");
}

function formatEntryId(date: Date, message: string): string {
  const dateStr = date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const slug = message
    .toLowerCase()
    .replace(/[^a-z0-9\uac00-\ud7af]+/g, "-")  // 한글 유니코드 범위 포함
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${dateStr}_${slug || "entry"}`;
}
