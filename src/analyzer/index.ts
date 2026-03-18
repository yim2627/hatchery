import { detectPlatforms, detectMonorepo } from "./detector.js";
import { scanIosProject } from "./scanners/ios.js";
import { scanWebProject } from "./scanners/web.js";
import type { AnalysisResult, ProfileName } from "../types/index.js";

export async function analyzeProject(rootDir: string): Promise<AnalysisResult> {
  const platforms = await detectPlatforms(rootDir);
  const monorepo = await detectMonorepo(rootDir);
  const primaryPlatform = platforms[0]?.id;

  let scanResult: any = {};

  if (primaryPlatform === "ios") {
    scanResult = await scanIosProject(rootDir);
  } else if (["react", "nextjs", "vue", "expo", "react-native"].includes(primaryPlatform ?? "")) {
    scanResult = await scanWebProject(rootDir);
  }

  const suggestedSkills = inferSkills(platforms.map((p) => p.id), scanResult);
  const suggestedProfile = inferProfile(scanResult);

  return {
    platforms,
    monorepo,
    dependencies: { [primaryPlatform ?? "unknown"]: scanResult.dependencies ?? [] },
    architecture: scanResult.architecture ?? {
      pattern: "Unknown",
      confidence: 0,
      signals: [],
    },
    permissions: scanResult.permissions ?? [],
    testing: scanResult.testing ?? {
      framework: "unknown",
      hasTests: false,
      estimatedCoverage: "none",
    },
    buildCommands: scanResult.buildCommands ?? {},
    frameworks: scanResult.frameworks ?? [],
    suggestedSkills,
    suggestedProfile,
  };
}

function inferSkills(platformIds: string[], scanResult: any): string[] {
  const skills = new Set<string>();

  // 항상 포함
  skills.add("architecture");
  skills.add("testing");

  // UI가 있는 플랫폼
  const hasUI = platformIds.some((p) =>
    ["ios", "react", "nextjs", "vue", "expo", "react-native"].includes(p),
  );
  if (hasUI) skills.add("ui-rules");

  // 모바일 → 동시성·상태관리가 특히 중요
  const hasMobile = platformIds.some((p) =>
    ["ios", "expo", "react-native"].includes(p),
  );
  if (hasMobile) {
    skills.add("concurrency");
    skills.add("state-management");
  }

  // 웹 → 상태관리
  const hasWeb = platformIds.some((p) =>
    ["react", "nextjs", "vue"].includes(p),
  );
  if (hasWeb) {
    skills.add("state-management");
    skills.add("concurrency");
  }

  // 네트워킹은 앱이면 거의 필수
  if (platformIds.length > 0) {
    skills.add("networking");
  }

  // 스캔 결과 기반 추가
  const deps = scanResult.dependencies ?? [];
  const depNames = deps.map((d: any) => d.name?.toLowerCase() ?? "");

  // 상태관리 라이브러리가 있으면 확실히
  if (scanResult.stateManagement) {
    skills.add("state-management");
  }

  // 권한이 있으면 접근성도 신경 써야
  if (scanResult.permissions?.length > 0) {
    skills.add("accessibility");
  }

  // 로깅/모니터링 프레임워크 감지
  if (
    scanResult.frameworks?.includes("CoreLocation") ||
    scanResult.frameworks?.includes("HealthKit") ||
    depNames.some((d: string) => ["sentry", "datadog", "pino", "winston"].some((k) => d.includes(k)))
  ) {
    skills.add("logging");
  }

  return [...skills].sort();
}

/**
 * 프로필 자동 결정.
 * 단일 시그널이 아니라 여러 요소를 점수화해서 판단한다.
 * 사람이 "우리는 intermediate"라고 고르는 게 아니라,
 * 코드베이스가 보여주는 성숙도가 프로필을 결정한다.
 */
function inferProfile(scanResult: any): ProfileName {
  let score = 0;

  // 테스트 현황 (가장 강한 시그널)
  const coverage = scanResult.testing?.estimatedCoverage;
  if (coverage === "high") score += 3;
  else if (coverage === "medium") score += 2;
  else if (coverage === "low") score += 1;
  // "none"이면 0

  // 린트 도구 존재
  if (scanResult.buildCommands?.lint) score += 1;

  // 아키텍처 패턴 명확성
  const archConfidence = scanResult.architecture?.confidence ?? 0;
  if (archConfidence >= 0.7) score += 1;

  // 의존성 복잡도 (DI 프레임워크 사용 등)
  const deps = scanResult.dependencies ?? [];
  const hasDI = deps.some((d: any) => d.category === "di");
  if (hasDI) score += 1;

  // 권한이 많으면 복잡한 앱
  const permissions = scanResult.permissions?.length ?? 0;
  if (permissions >= 3) score += 1;

  // 점수 → 프로필
  if (score >= 5) return "advanced";
  if (score >= 2) return "intermediate";
  return "basic";
}

export { detectPlatforms, detectMonorepo } from "./detector.js";
export { generateDirectoryTree } from "./scanners/shared.js";
