import fs from "node:fs";
import path from "node:path";
import type { HatcheryState, WorkspaceState, ProfileName, PlatformId } from "../types/index.js";

const STATE_DIR = ".hatchery";
const STATE_FILE = "state.json";
const CURRENT_VERSION = 1;

export function getStateDir(rootDir: string): string {
  return path.join(rootDir, STATE_DIR);
}

export function getStateFilePath(rootDir: string, workspace?: string): string {
  if (workspace) {
    return path.join(rootDir, STATE_DIR, "workspaces", workspace, STATE_FILE);
  }
  return path.join(rootDir, STATE_DIR, STATE_FILE);
}

export function stateExists(rootDir: string, workspace?: string): boolean {
  return fs.existsSync(getStateFilePath(rootDir, workspace));
}

export function loadState(rootDir: string, workspace?: string): HatcheryState | null {
  const filePath = getStateFilePath(rootDir, workspace);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as HatcheryState;
  } catch {
    return null;
  }
}

export function saveState(rootDir: string, state: HatcheryState, workspace?: string): void {
  const filePath = getStateFilePath(rootDir, workspace);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + "\n");
}

export function createInitialState(opts: {
  profile: ProfileName;
  skills: string[];
  workflows: string[];
  platforms: PlatformId[];
  configPath: string;
}): HatcheryState {
  const now = new Date().toISOString();
  return {
    version: CURRENT_VERSION,
    profile: opts.profile,
    skills: opts.skills.sort(),
    workflows: opts.workflows.sort(),
    platforms: opts.platforms,
    configPath: opts.configPath,
    contextPath: ".hatchery/rendered_context.md",
    createdAt: now,
    updatedAt: now,
  };
}

export function updateState(
  rootDir: string,
  updates: Partial<Omit<HatcheryState, "version" | "createdAt">>,
  workspace?: string,
): HatcheryState {
  const existing = loadState(rootDir, workspace);
  if (!existing) {
    throw new Error("No existing state found. Run 'hatchery onboard' first.");
  }

  const updated: HatcheryState = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  saveState(rootDir, updated, workspace);
  return updated;
}

export function listWorkspaces(rootDir: string): string[] {
  const workspacesDir = path.join(rootDir, STATE_DIR, "workspaces");
  if (!fs.existsSync(workspacesDir)) return [];

  return fs
    .readdirSync(workspacesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => fs.existsSync(path.join(workspacesDir, d.name, STATE_FILE)))
    .map((d) => d.name);
}
