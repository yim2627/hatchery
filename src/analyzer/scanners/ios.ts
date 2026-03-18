import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type {
  ArchitectureGuess,
  BuildCommands,
  DependencyInfo,
  TestingInfo,
} from "../types/index.js";

export async function scanIosProject(rootDir: string) {
  const frameworkDetection = await detectFrameworks(rootDir);
  return {
    architecture: await detectArchitecture(rootDir),
    dependencies: await detectDependencies(rootDir),
    testing: await detectTesting(rootDir),
    permissions: await detectPermissions(rootDir),
    buildCommands: detectBuildCommands(rootDir),
    frameworks: frameworkDetection.names,
    frameworkCounts: frameworkDetection.counts,
  };
}

async function detectArchitecture(rootDir: string): Promise<ArchitectureGuess> {
  const signals: string[] = [];
  let pattern = "Unknown";
  let confidence = 0.3;

  const dirs = await fg("**/*", {
    cwd: rootDir,
    onlyDirectories: true,
    deep: 5,
    ignore: ["node_modules/**", ".git/**", "Pods/**", ".build/**", "Derived/**"],
  });

  const dirNames = new Set(dirs.map((d) => path.basename(d).toLowerCase()));

  // MVVM signals
  const mvvmSignals = ["viewmodels", "viewmodel", "views", "models", "repositories", "repository"];
  const mvvmHits = mvvmSignals.filter((s) => dirNames.has(s));
  if (mvvmHits.length >= 2) {
    pattern = "MVVM";
    confidence = 0.6 + mvvmHits.length * 0.05;
    signals.push(`Directories found: ${mvvmHits.join(", ")}`);
  } else if (mvvmHits.length === 1) {
    // 파일 기반 보강: ViewModel 파일이 있으면 부분 MVVM
    const vmFiles = await fg("**/*ViewModel*.swift", {
      cwd: rootDir,
      deep: 4,
      ignore: ["Pods/**", ".build/**", "node_modules/**"],
    });
    if (vmFiles.length > 0) {
      pattern = "MVVM";
      confidence = 0.5;
      signals.push(`Directory: ${mvvmHits[0]}, ViewModel files: ${vmFiles.length}`);
    }
  }

  // Clean Architecture signals
  const cleanSignals = [
    "domain", "data", "presentation",
    "usecases", "usecase", "usecasesimpl",
    "entities", "entity",
    "interfaces", "implements",
  ];
  const cleanHits = cleanSignals.filter((s) => dirNames.has(s));
  if (cleanHits.length >= 3) {
    pattern = "Clean Architecture";
    confidence = 0.7 + Math.min(cleanHits.length * 0.05, 0.25);
    signals.push(`Clean Architecture layers: ${cleanHits.join(", ")}`);
  } else if (cleanHits.length === 2 && pattern === "Unknown") {
    pattern = "Clean Architecture (partial)";
    confidence = 0.4 + cleanHits.length * 0.05;
    signals.push(`Partial Clean Architecture layers: ${cleanHits.join(", ")}`);
  }

  // TCA signals
  const swiftFiles = await fg("**/*.swift", {
    cwd: rootDir,
    deep: 4,
    ignore: ["Pods/**", ".build/**", "node_modules/**"],
  });

  for (const file of swiftFiles.slice(0, 50)) {
    try {
      const content = fs.readFileSync(path.join(rootDir, file), "utf-8");
      if (content.includes("ReducerOf") || content.includes("ComposableArchitecture")) {
        pattern = "TCA (The Composable Architecture)";
        confidence = 0.9;
        signals.push(`TCA import found in ${file}`);
        break;
      }
    } catch {
      // skip unreadable files
    }
  }

  // ReactorKit signals
  if (pattern !== "TCA (The Composable Architecture)") {
    for (const file of swiftFiles.slice(0, 100)) {
      try {
        const content = fs.readFileSync(path.join(rootDir, file), "utf-8");
        if (content.includes("import ReactorKit") || content.includes("ReactorKit.Reactor")) {
          const base = pattern === "Unknown" ? "" : pattern + " + ";
          pattern = `${base}ReactorKit`;
          confidence = Math.max(confidence, 0.8);
          signals.push(`ReactorKit found in ${file}`);
          break;
        }
      } catch {
        // skip
      }
    }
  }

  // Repository pattern supplement
  if (dirNames.has("repositories") || dirNames.has("repository")) {
    if (pattern === "MVVM") pattern = "MVVM with Repository pattern";
    signals.push("Repository layer detected");
  }

  return { pattern, confidence: Math.min(confidence, 1), signals };
}

async function detectDependencies(rootDir: string): Promise<DependencyInfo[]> {
  const deps: DependencyInfo[] = [];

  // Swift Package Manager
  const packageSwift = path.join(rootDir, "Package.swift");
  if (fs.existsSync(packageSwift)) {
    try {
      const content = fs.readFileSync(packageSwift, "utf-8");
      const urlRegex = /\.package\s*\(\s*url:\s*"([^"]+)"/g;
      let match;
      while ((match = urlRegex.exec(content)) !== null) {
        const url = match[1];
        const name = url.split("/").pop()?.replace(".git", "") ?? url;
        deps.push({ name, category: categorizeSwiftDep(name) });
      }
    } catch {
      // skip
    }
  }

  // CocoaPods
  const podfile = path.join(rootDir, "Podfile");
  if (fs.existsSync(podfile)) {
    try {
      const content = fs.readFileSync(podfile, "utf-8");
      const podRegex = /pod\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = podRegex.exec(content)) !== null) {
        deps.push({ name: match[1], category: categorizeSwiftDep(match[1]) });
      }
    } catch {
      // skip
    }
  }

  return deps;
}

function categorizeSwiftDep(name: string): DependencyInfo["category"] {
  const lower = name.toLowerCase();
  if (["alamofire", "moya", "urlsession", "grpc-swift"].some((k) => lower.includes(k))) return "networking";
  if (["realm", "coredata", "swiftdata", "grdb"].some((k) => lower.includes(k))) return "storage";
  if (["snapkit", "kingfisher", "nuke", "sdwebimage", "lottie"].some((k) => lower.includes(k))) return "ui";
  if (["quick", "nimble", "xctest", "viewinspector"].some((k) => lower.includes(k))) return "testing";
  if (["swinject", "factory", "needle", "resolver"].some((k) => lower.includes(k))) return "di";
  return "other";
}

async function detectTesting(rootDir: string): Promise<TestingInfo> {
  const testFiles = await fg("**/*Tests.swift", {
    cwd: rootDir,
    deep: 4,
    ignore: ["Pods/**", ".build/**"],
  });

  const testDirs = await fg("**/*Tests", {
    cwd: rootDir,
    onlyDirectories: true,
    deep: 3,
  });

  let framework = "XCTest";
  // Check for Swift Testing
  for (const file of testFiles.slice(0, 10)) {
    try {
      const content = fs.readFileSync(path.join(rootDir, file), "utf-8");
      if (content.includes("import Testing") || content.includes("@Test")) {
        framework = "Swift Testing";
        break;
      }
    } catch {
      // skip
    }
  }

  return {
    framework,
    hasTests: testFiles.length > 0,
    testDirectory: testDirs[0],
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

async function detectPermissions(rootDir: string): Promise<string[]> {
  const permissions: string[] = [];
  const plists = await fg("**/Info.plist", {
    cwd: rootDir,
    deep: 3,
    ignore: ["Pods/**", ".build/**"],
  });

  const permissionKeys: Record<string, string> = {
    NSCameraUsageDescription: "Camera",
    NSLocationWhenInUseUsageDescription: "Location (When In Use)",
    NSLocationAlwaysUsageDescription: "Location (Always)",
    NSPhotoLibraryUsageDescription: "Photo Library",
    NSMicrophoneUsageDescription: "Microphone",
    NSHealthShareUsageDescription: "HealthKit (Read)",
    NSHealthUpdateUsageDescription: "HealthKit (Write)",
    NSMotionUsageDescription: "Motion",
    NSBluetoothAlwaysUsageDescription: "Bluetooth",
    NSContactsUsageDescription: "Contacts",
    NSCalendarsUsageDescription: "Calendars",
    NSFaceIDUsageDescription: "Face ID",
  };

  for (const plist of plists) {
    try {
      const content = fs.readFileSync(path.join(rootDir, plist), "utf-8");
      for (const [key, label] of Object.entries(permissionKeys)) {
        if (content.includes(key)) {
          permissions.push(label);
        }
      }
    } catch {
      // skip
    }
  }

  return [...new Set(permissions)];
}

function detectBuildCommands(rootDir: string): BuildCommands {
  const commands: BuildCommands = {};

  // xcodeproj를 rootDir + 1~2 depth까지 탐색
  const scheme = findXcodeprojScheme(rootDir);
  if (scheme) {
    commands.build = `xcodebuild -scheme ${scheme} build`;
    commands.test = `xcodebuild test -scheme ${scheme}`;
  }

  // Check for Swift Package
  if (fs.existsSync(path.join(rootDir, "Package.swift"))) {
    commands.build = commands.build ?? "swift build";
    commands.test = commands.test ?? "swift test";
  }

  return commands;
}

function findXcodeprojScheme(rootDir: string): string | null {
  // depth 0 → 1 → 2 순서로 탐색
  for (let depth = 0; depth <= 2; depth++) {
    const dirs = depth === 0 ? [rootDir] : getSubdirs(rootDir, depth);
    for (const dir of dirs) {
      try {
        const xcodeproj = fs.readdirSync(dir).find((f) => f.endsWith(".xcodeproj"));
        if (xcodeproj) return xcodeproj.replace(".xcodeproj", "");
      } catch {
        // skip
      }
    }
  }
  return null;
}

function getSubdirs(rootDir: string, depth: number): string[] {
  if (depth <= 0) return [rootDir];
  try {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "Pods" && e.name !== "node_modules")
      .map((e) => path.join(rootDir, e.name));
    if (depth === 1) return dirs;
    return dirs.flatMap((d) => getSubdirs(d, depth - 1));
  } catch {
    return [];
  }
}

interface FrameworkDetection {
  names: string[];
  counts: Record<string, number>;
}

async function detectFrameworks(rootDir: string): Promise<FrameworkDetection> {
  const swiftFiles = await fg("**/*.swift", {
    cwd: rootDir,
    deep: 5,
    ignore: ["Pods/**", ".build/**", "*Tests*/**", "Derived/**"],
  });

  const importCounts = new Map<string, number>();
  const interestingImports = new Set([
    "SwiftUI",
    "UIKit",
    "Combine",
    "SwiftData",
    "CoreData",
    "CoreLocation",
    "HealthKit",
    "MapKit",
    "WidgetKit",
    "ActivityKit",
    "ReactorKit",
  ]);

  for (const file of swiftFiles.slice(0, 300)) {
    try {
      const content = fs.readFileSync(path.join(rootDir, file), "utf-8");
      for (const fw of interestingImports) {
        if (content.includes(`import ${fw}`)) {
          importCounts.set(fw, (importCounts.get(fw) ?? 0) + 1);
        }
      }
    } catch {
      // skip
    }
  }

  const counts: Record<string, number> = {};
  const names: string[] = [];
  for (const [fw, count] of importCounts) {
    names.push(fw);
    counts[fw] = count;
  }

  return { names, counts };
}
