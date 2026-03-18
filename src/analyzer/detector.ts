import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type { PlatformId, PlatformInfo, MonorepoInfo, WorkspaceInfo } from "../types/index.js";

interface DetectionRule {
  platform: PlatformId;
  signals: SignalCheck[];
}

interface SignalCheck {
  type: "glob" | "glob-dir" | "package-dep" | "file-exists";
  pattern: string;
  weight: number; // 0-1 contribution to confidence
  description: string;
}

const DETECTION_RULES: DetectionRule[] = [
  {
    platform: "ios",
    signals: [
      { type: "glob-dir", pattern: "**/*.xcodeproj", weight: 0.5, description: "Xcode project found" },
      { type: "glob-dir", pattern: "**/*.xcworkspace", weight: 0.4, description: "Xcode workspace found" },
      { type: "file-exists", pattern: "Package.swift", weight: 0.3, description: "Swift Package found" },
      { type: "glob", pattern: "**/*.swift", weight: 0.2, description: "Swift source files found" },
      { type: "glob", pattern: "**/Info.plist", weight: 0.1, description: "Info.plist found" },
    ],
  },
  {
    platform: "expo",
    signals: [
      { type: "package-dep", pattern: "expo", weight: 0.6, description: "Expo dependency" },
      { type: "file-exists", pattern: "app.json", weight: 0.2, description: "Expo app.json" },
      { type: "file-exists", pattern: "app.config.js", weight: 0.2, description: "Expo app config" },
      { type: "file-exists", pattern: "app.config.ts", weight: 0.2, description: "Expo app config (TS)" },
    ],
  },
  {
    platform: "react-native",
    signals: [
      { type: "package-dep", pattern: "react-native", weight: 0.5, description: "React Native dependency" },
      { type: "file-exists", pattern: "metro.config.js", weight: 0.3, description: "Metro bundler config" },
      { type: "file-exists", pattern: "react-native.config.js", weight: 0.2, description: "RN config file" },
    ],
  },
  {
    platform: "nextjs",
    signals: [
      { type: "package-dep", pattern: "next", weight: 0.6, description: "Next.js dependency" },
      { type: "file-exists", pattern: "next.config.js", weight: 0.3, description: "Next.js config" },
      { type: "file-exists", pattern: "next.config.mjs", weight: 0.3, description: "Next.js config (ESM)" },
      { type: "file-exists", pattern: "next.config.ts", weight: 0.3, description: "Next.js config (TS)" },
    ],
  },
  {
    platform: "vue",
    signals: [
      { type: "package-dep", pattern: "vue", weight: 0.5, description: "Vue dependency" },
      { type: "file-exists", pattern: "vite.config.ts", weight: 0.2, description: "Vite config" },
      { type: "glob", pattern: "**/*.vue", weight: 0.3, description: "Vue SFC files found" },
    ],
  },
  {
    platform: "react",
    signals: [
      { type: "package-dep", pattern: "react", weight: 0.4, description: "React dependency" },
      { type: "package-dep", pattern: "react-dom", weight: 0.3, description: "React DOM dependency" },
      { type: "glob", pattern: "**/*.tsx", weight: 0.2, description: "TSX files found" },
      { type: "glob", pattern: "**/*.jsx", weight: 0.2, description: "JSX files found" },
    ],
  },
];

// Priority: more specific platforms suppress generic ones
const PLATFORM_SUPPRESSION: Record<string, PlatformId[]> = {
  nextjs: ["react"],        // Next.js suppresses generic React
  expo: ["react-native"],   // Expo suppresses generic RN
};

export async function detectPlatforms(rootDir: string): Promise<PlatformInfo[]> {
  const results: PlatformInfo[] = [];

  for (const rule of DETECTION_RULES) {
    const matched = await evaluateRule(rule, rootDir);
    if (matched) {
      results.push(matched);
    }
  }

  return applySuppressions(results).sort((a, b) => b.confidence - a.confidence);
}

async function evaluateRule(rule: DetectionRule, rootDir: string): Promise<PlatformInfo | null> {
  const matchedSignals: string[] = [];
  let totalWeight = 0;

  for (const signal of rule.signals) {
    const hit = await checkSignal(signal, rootDir);
    if (hit) {
      matchedSignals.push(signal.description);
      totalWeight += signal.weight;
    }
  }

  if (matchedSignals.length === 0) return null;

  const confidence = Math.min(totalWeight, 1);
  if (confidence < 0.2) return null;

  return {
    id: rule.platform,
    root: ".",
    confidence: Math.round(confidence * 100) / 100,
    signals: matchedSignals,
  };
}

async function checkSignal(signal: SignalCheck, rootDir: string): Promise<boolean> {
  switch (signal.type) {
    case "file-exists":
      return fs.existsSync(path.join(rootDir, signal.pattern));

    case "glob": {
      const matches = await fg(signal.pattern, {
        cwd: rootDir,
        onlyFiles: true,
        ignore: ["node_modules/**", ".git/**", "Pods/**", "build/**", ".build/**"],
        deep: 4,
      });
      return matches.length > 0;
    }

    case "glob-dir": {
      const matches = await fg(signal.pattern, {
        cwd: rootDir,
        onlyDirectories: true,
        ignore: ["node_modules/**", ".git/**", "Pods/**", "build/**", ".build/**"],
        deep: 4,
      });
      return matches.length > 0;
    }

    case "package-dep":
      return checkPackageDep(rootDir, signal.pattern);

    default:
      return false;
  }
}

function checkPackageDep(rootDir: string, depName: string): boolean {
  const pkgPath = path.join(rootDir, "package.json");
  if (!fs.existsSync(pkgPath)) return false;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    return depName in allDeps;
  } catch {
    return false;
  }
}

function applySuppressions(platforms: PlatformInfo[]): PlatformInfo[] {
  const detectedIds = new Set(platforms.map((p) => p.id));
  const suppressed = new Set<PlatformId>();

  for (const [specific, genericList] of Object.entries(PLATFORM_SUPPRESSION)) {
    if (detectedIds.has(specific as PlatformId)) {
      for (const generic of genericList) {
        suppressed.add(generic);
      }
    }
  }

  return platforms.filter((p) => !suppressed.has(p.id));
}

// ─── Monorepo Detection ───

export async function detectMonorepo(rootDir: string): Promise<MonorepoInfo | null> {
  const pkgPath = path.join(rootDir, "package.json");
  if (!fs.existsSync(pkgPath)) return null;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

    // pnpm workspaces
    const pnpmWorkspacePath = path.join(rootDir, "pnpm-workspace.yaml");
    if (fs.existsSync(pnpmWorkspacePath)) {
      const workspaces = await resolveWorkspaces(rootDir, pnpmWorkspacePath);
      return { tool: "pnpm", workspaces };
    }

    // yarn/npm workspaces (package.json)
    if (pkg.workspaces) {
      const patterns = Array.isArray(pkg.workspaces)
        ? pkg.workspaces
        : pkg.workspaces.packages ?? [];
      const workspaces = await resolveWorkspacePatterns(rootDir, patterns);
      const tool = fs.existsSync(path.join(rootDir, "yarn.lock")) ? "yarn" : "npm";
      return { tool, workspaces };
    }

    // Turborepo
    if (fs.existsSync(path.join(rootDir, "turbo.json"))) {
      return { tool: "turbo", workspaces: [] };
    }

    // Nx
    if (fs.existsSync(path.join(rootDir, "nx.json"))) {
      return { tool: "nx", workspaces: [] };
    }
  } catch {
    // ignore parse errors
  }

  return null;
}

async function resolveWorkspaces(rootDir: string, pnpmWorkspacePath: string): Promise<WorkspaceInfo[]> {
  // Simple pnpm-workspace.yaml parser
  const content = fs.readFileSync(pnpmWorkspacePath, "utf-8");
  const patterns: string[] = [];
  let inPackages = false;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "packages:") {
      inPackages = true;
      continue;
    }
    if (inPackages && trimmed.startsWith("- ")) {
      patterns.push(trimmed.slice(2).replace(/['"]/g, ""));
    } else if (inPackages && !trimmed.startsWith("-") && trimmed.length > 0) {
      inPackages = false;
    }
  }

  return resolveWorkspacePatterns(rootDir, patterns);
}

async function resolveWorkspacePatterns(rootDir: string, patterns: string[]): Promise<WorkspaceInfo[]> {
  const workspaces: WorkspaceInfo[] = [];

  for (const pattern of patterns) {
    const dirs = await fg(pattern, {
      cwd: rootDir,
      onlyDirectories: true,
      ignore: ["node_modules/**"],
    });

    for (const dir of dirs) {
      const fullPath = path.join(rootDir, dir);
      if (!fs.existsSync(path.join(fullPath, "package.json"))) continue;

      const platforms = await detectPlatforms(fullPath);
      const primary = platforms[0] ?? {
        id: "typescript" as PlatformId,
        root: dir,
        confidence: 0.5,
        signals: ["Fallback: package.json exists"],
      };

      workspaces.push({
        name: path.basename(dir),
        path: dir,
        platform: { ...primary, root: dir },
      });
    }
  }

  return workspaces;
}
