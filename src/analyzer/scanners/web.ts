import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type {
  ArchitectureGuess,
  BuildCommands,
  DependencyInfo,
  TestingInfo,
} from "../types/index.js";

export async function scanWebProject(rootDir: string) {
  const pkg = readPackageJson(rootDir);
  return {
    architecture: await detectArchitecture(rootDir, pkg),
    dependencies: detectDependencies(pkg),
    testing: await detectTesting(rootDir, pkg),
    buildCommands: detectBuildCommands(pkg),
    framework: detectFramework(pkg),
    stateManagement: detectStateManagement(pkg),
  };
}

function readPackageJson(rootDir: string): Record<string, any> {
  const pkgPath = path.join(rootDir, "package.json");
  if (!fs.existsSync(pkgPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  } catch {
    return {};
  }
}

function getAllDeps(pkg: Record<string, any>): Record<string, string> {
  return { ...pkg.dependencies, ...pkg.devDependencies };
}

async function detectArchitecture(rootDir: string, pkg: Record<string, any>): Promise<ArchitectureGuess> {
  const signals: string[] = [];
  const dirs = await fg("**/*", {
    cwd: rootDir,
    onlyDirectories: true,
    deep: 3,
    ignore: ["node_modules/**", ".git/**", ".next/**", "dist/**", "build/**"],
  });

  const dirNames = new Set(dirs.map((d) => path.basename(d).toLowerCase()));

  // Next.js App Router vs Pages Router
  if (dirNames.has("app") && fs.existsSync(path.join(rootDir, "app"))) {
    signals.push("Next.js App Router detected");
  } else if (dirNames.has("pages")) {
    signals.push("Next.js Pages Router detected");
  }

  // Feature-based architecture
  const featureSignals = ["features", "modules", "domains"];
  const featureHits = featureSignals.filter((s) => dirNames.has(s));
  if (featureHits.length > 0) {
    signals.push(`Feature-based structure: ${featureHits.join(", ")}`);
    return {
      pattern: "Feature-based / Module-based",
      confidence: 0.7,
      signals,
    };
  }

  // Component-centric (typical React)
  const componentSignals = ["components", "hooks", "utils", "services", "api", "lib"];
  const componentHits = componentSignals.filter((s) => dirNames.has(s));
  if (componentHits.length >= 3) {
    signals.push(`Component-centric structure: ${componentHits.join(", ")}`);
    return {
      pattern: "Component-centric with hooks",
      confidence: 0.6,
      signals,
    };
  }

  // Layered
  const layeredSignals = ["domain", "infrastructure", "presentation", "application"];
  const layeredHits = layeredSignals.filter((s) => dirNames.has(s));
  if (layeredHits.length >= 2) {
    signals.push(`Layered architecture: ${layeredHits.join(", ")}`);
    return {
      pattern: "Layered / Clean Architecture",
      confidence: 0.7,
      signals,
    };
  }

  return {
    pattern: "Flat / Convention-based",
    confidence: 0.3,
    signals: signals.length > 0 ? signals : ["No strong architectural pattern detected"],
  };
}

function detectDependencies(pkg: Record<string, any>): DependencyInfo[] {
  const allDeps = getAllDeps(pkg);
  return Object.entries(allDeps).map(([name, version]) => ({
    name,
    version: version as string,
    category: categorizeWebDep(name),
  }));
}

function categorizeWebDep(name: string): DependencyInfo["category"] {
  const lower = name.toLowerCase();
  if (["axios", "fetch", "ky", "got", "swr", "react-query", "@tanstack/react-query", "graphql", "urql", "apollo"].some((k) => lower.includes(k))) return "networking";
  if (["prisma", "drizzle", "typeorm", "mongoose", "redis", "ioredis", "zustand", "redux", "jotai", "recoil", "valtio", "mobx", "pinia"].some((k) => lower.includes(k))) return "storage";
  if (["@mui", "chakra", "tailwind", "styled-components", "emotion", "radix", "shadcn", "ant-design", "antd", "headlessui"].some((k) => lower.includes(k))) return "ui";
  if (["jest", "vitest", "testing-library", "playwright", "cypress", "mocha", "chai", "storybook"].some((k) => lower.includes(k))) return "testing";
  return "other";
}

async function detectTesting(rootDir: string, pkg: Record<string, any>): Promise<TestingInfo> {
  const allDeps = getAllDeps(pkg);

  let framework = "unknown";
  if ("vitest" in allDeps) framework = "Vitest";
  else if ("jest" in allDeps) framework = "Jest";
  else if ("@playwright/test" in allDeps) framework = "Playwright";
  else if ("cypress" in allDeps) framework = "Cypress";

  const testFiles = await fg(
    ["**/*.test.{ts,tsx,js,jsx}", "**/*.spec.{ts,tsx,js,jsx}", "**/__tests__/**/*.{ts,tsx,js,jsx}"],
    {
      cwd: rootDir,
      deep: 5,
      ignore: ["node_modules/**", ".next/**"],
    },
  );

  return {
    framework,
    hasTests: testFiles.length > 0,
    testDirectory: testFiles.length > 0 ? path.dirname(testFiles[0]) : undefined,
    estimatedCoverage:
      testFiles.length === 0
        ? "none"
        : testFiles.length < 5
          ? "low"
          : testFiles.length < 20
            ? "medium"
            : "high",
  };
}

function detectBuildCommands(pkg: Record<string, any>): BuildCommands {
  const scripts = pkg.scripts ?? {};
  return {
    build: scripts.build ? `npm run build` : undefined,
    test: scripts.test ? `npm run test` : undefined,
    lint: scripts.lint ? `npm run lint` : undefined,
  };
}

function detectFramework(pkg: Record<string, any>): string {
  const allDeps = getAllDeps(pkg);
  if ("next" in allDeps) return "Next.js";
  if ("nuxt" in allDeps) return "Nuxt";
  if ("vue" in allDeps) return "Vue";
  if ("svelte" in allDeps) return "Svelte";
  if ("expo" in allDeps) return "Expo (React Native)";
  if ("react-native" in allDeps) return "React Native";
  if ("react" in allDeps) return "React";
  return "Unknown";
}

function detectStateManagement(pkg: Record<string, any>): string | null {
  const allDeps = getAllDeps(pkg);
  if ("zustand" in allDeps) return "Zustand";
  if ("@reduxjs/toolkit" in allDeps || "redux" in allDeps) return "Redux";
  if ("jotai" in allDeps) return "Jotai";
  if ("recoil" in allDeps) return "Recoil";
  if ("mobx" in allDeps) return "MobX";
  if ("valtio" in allDeps) return "Valtio";
  if ("pinia" in allDeps) return "Pinia";
  return null;
}
