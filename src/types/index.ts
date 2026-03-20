// ─── Platforms ───

export type PlatformId =
  | "ios"
  | "react"
  | "nextjs"
  | "vue"
  | "expo"
  | "react-native"
  | "typescript"
  | "universal";

export interface PlatformInfo {
  id: PlatformId;
  root: string; // relative path from repo root
  confidence: number; // 0-1
  signals: string[]; // what triggered detection
}

// ─── Profiles ───

export type ProfileName = "basic" | "intermediate" | "advanced";

export interface ProfileFlags {
  strict_self_review: boolean;
  require_regression_tests: boolean;
  include_performance_guidance: boolean;
  include_security_privacy_emphasis: boolean;
  require_risk_summary?: boolean;
  require_state_transition_thinking?: boolean;
}

export interface Profile {
  name: ProfileName;
  description: string;
  description_ko: string;
  default_skills: string[];
  flags: ProfileFlags;
  guidance?: string;
}

// ─── Skills ───

export interface SkillDefinition {
  name: string;
  builtin: boolean;
  platforms: PlatformId[]; // which platform variants exist
  description?: string;
}

// ─── Analysis ───

export interface ArchitectureGuess {
  pattern: string; // e.g. "MVVM", "Clean Architecture", "MVC"
  confidence: number;
  signals: string[];
}

export interface DependencyInfo {
  name: string;
  version?: string;
  category?: "networking" | "ui" | "testing" | "storage" | "di" | "other";
}

export interface TestingInfo {
  framework: string;
  hasTests: boolean;
  testDirectory?: string;
  estimatedCoverage?: "none" | "low" | "medium" | "high";
}

export interface BuildCommands {
  build?: string;
  test?: string;
  lint?: string;
}

export interface AnalysisResult {
  platforms: PlatformInfo[];
  monorepo: MonorepoInfo | null;
  dependencies: Record<string, DependencyInfo[]>;
  architecture: ArchitectureGuess;
  permissions: string[];
  testing: TestingInfo;
  buildCommands: BuildCommands;
  frameworks: string[];
  frameworkCounts: Record<string, number>;
  suggestedSkills: string[];
  suggestedProfile: ProfileName;
}

// ─── Monorepo ───

export interface WorkspaceInfo {
  name: string;
  path: string; // relative from repo root
  platform: PlatformInfo;
}

export interface MonorepoInfo {
  tool: "pnpm" | "yarn" | "npm" | "turbo" | "nx" | "lerna" | "unknown";
  workspaces: WorkspaceInfo[];
}

// ─── State ───

export interface HatcheryState {
  version: number;
  profile: ProfileName;
  skills: string[];
  workflows: string[];
  platforms: PlatformId[];
  configPath: string;
  contextPath: string;
  specs?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceState extends HatcheryState {
  workspacePath: string;
}

// ─── Project Config ───

export interface ProjectConfig {
  project_name: string;
  platforms: PlatformId[];
  ui_framework: string;
  architecture_style: string;
  min_version: string;
  package_manager: string;
  project_generator: string;
  test_framework: string;
  lint_tools: string;
  network_layer_name: string;
  persistence_layer_name: string;
  logging_system: string;
  privacy_requirements: string;
  preferred_file_line_limit: number;
  build_command: string;
  test_command: string;
}

// ─── Journal ───

export interface JournalEntry {
  id: string;
  timestamp: string;
  message: string;
  filesChanged?: string[];
  workflow?: string;
  skills?: string[];
}

// ─── Audit ───

export type AuditSeverity = "error" | "warning" | "info";

export interface AuditFinding {
  severity: AuditSeverity;
  skill: string;
  rule: string;
  file: string;
  line?: number;
  message: string;
}

export interface AuditResult {
  findings: AuditFinding[];
  checkedFiles: number;
  passedRules: number;
  failedRules: number;
}

// ─── Template ───

export interface TemplateContext {
  [key: string]: string | string[] | boolean | number | undefined;
}
