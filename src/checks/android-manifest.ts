import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { normalizePermission, type AndroidPermissionsConfig } from "../config.js";
import { err, ok, type CheckResult, type Problem, type Result } from "../types.js";
import type { Check } from "./types.js";

/**
 * Android 매니페스트 권한 검사 두 가지.
 *
 * - `android-manifest`: prebuild 산출물(소스 매니페스트). `blockedPermissions` 설정이 빠지는 사고는
 *   여기서만 보인다 — 설정이 사라지면 제거 지시자(`tools:node="remove"`)가 붙은 항목이 소스에서 통째로
 *   사라지고, 병합 때 라이브러리 매니페스트에서 조용히 되살아난다. 그래서 "없음"이 아니라 "제거 지시자가
 *   붙어 있는가"를 본다.
 * - `android-merged-manifest`: Gradle이 라이브러리 매니페스트까지 합친 최종본. 라이브러리가 넣는 권한
 *   (예: expo-notifications의 POST_NOTIFICATIONS)은 여기에만 있다. Gradle 단계가 필요하므로
 *   id를 지정했을 때만 돈다.
 */
export const androidManifestCheck: Check = {
  id: "android-manifest",
  title: "prebuild 산출물 AndroidManifest.xml의 권한",
  run({ cwd, config }) {
    return Promise.resolve(runAndroidManifest(cwd, config.android?.permissions, "source"));
  },
};

export const androidMergedManifestCheck: Check = {
  id: "android-merged-manifest",
  title: "Gradle 병합 매니페스트(최종본)의 권한",
  runsByDefault: false,
  run({ cwd, config }) {
    return Promise.resolve(runAndroidManifest(cwd, config.android?.permissions, "merged"));
  },
};

export type ManifestMode = "source" | "merged";

const SOURCE_MANIFEST = "android/app/src/main/AndroidManifest.xml";
const INTERMEDIATES = "android/app/build/intermediates";

export function runAndroidManifest(
  cwd: string,
  options: AndroidPermissionsConfig | undefined,
  mode: ManifestMode,
): CheckResult {
  if (!options) return { status: "skip", reason: "`android.permissions` 설정이 없습니다." };
  const required = [...(options.required ?? []), ...(mode === "merged" ? (options.requiredMerged ?? []) : [])];
  const forbidden = options.forbidden ?? [];
  if (required.length === 0 && forbidden.length === 0) {
    return { status: "skip", reason: `${mode === "merged" ? "병합" : "소스"} 매니페스트에 적용할 권한 규칙이 없습니다.` };
  }

  const located = locateManifest(cwd, options, mode);
  if (!located.ok) return failWith(located.error.message, located.error.hint);

  const permissions = readPermissions(readFileSync(located.value, "utf8"));
  const problems: Problem[] = [];

  for (const rule of forbidden) {
    const tag = permissions.get(normalizePermission(rule.name));
    if (mode === "merged") {
      // 병합본에 남은 권한은 그대로 앱에 실린다.
      if (tag !== undefined) problems.push({ message: `${rule.name}가 최종 매니페스트에 남아 있습니다.`, hint: rule.reason });
    } else if (rule.blockedInSource === true) {
      if (tag === undefined) {
        problems.push({
          message: `${rule.name}에 제거 지시자가 없습니다 (항목 자체가 없음).`,
          hint: `${rule.reason} app.json의 android.blockedPermissions에서 빠진 것으로 보입니다.`,
        });
      } else if (!isRemoved(tag)) {
        problems.push({ message: `${rule.name}가 tools:node="remove" 없이 선언돼 있습니다.`, hint: rule.reason });
      }
    } else if (tag !== undefined && !isRemoved(tag)) {
      problems.push({ message: `${rule.name}가 선언돼 있습니다.`, hint: rule.reason });
    }
  }

  for (const rule of required) {
    const tag = permissions.get(normalizePermission(rule.name));
    if (tag === undefined || isRemoved(tag)) {
      problems.push({ message: `${rule.name}가 없습니다.`, hint: rule.reason });
    }
  }

  const where = path.relative(cwd, located.value);
  const total = required.length + forbidden.length;
  return problems.length === 0
    ? { status: "pass", summary: `${where}: 권한 규칙 ${String(total)}개 모두 충족` }
    : { status: "fail", summary: `${where}: 권한 규칙 ${String(total)}개 중 ${String(problems.length)}개 위반`, problems };
}

/** `<uses-permission …>` 태그를 전체 권한 이름 → 태그 원문으로 모은다. */
export function readPermissions(xml: string): Map<string, string> {
  const found = new Map<string, string>();
  // `[\s>]`로 끊는다 — `\b`는 '-' 앞도 경계라 `<uses-permission-sdk-23`까지 잡힌다.
  for (const m of xml.matchAll(/<uses-permission[\s>][^>]*>/g)) {
    const tag = m[0];
    const name = /android:name\s*=\s*"([^"]+)"/.exec(tag)?.[1];
    if (name !== undefined) found.set(name, tag);
  }
  return found;
}

export const isRemoved = (tag: string): boolean => /tools:node\s*=\s*"remove"/.test(tag);

function failWith(message: string, hint?: string): CheckResult {
  return { status: "fail", summary: message, problems: [hint === undefined ? { message } : { message, hint }] };
}

function locateManifest(
  cwd: string,
  options: AndroidPermissionsConfig,
  mode: ManifestMode,
): Result<string, { message: string; hint?: string }> {
  if (mode === "source") {
    const p = path.resolve(cwd, options.sourcePath ?? SOURCE_MANIFEST);
    return existsSync(p)
      ? ok(p)
      : err({
          message: `${path.relative(cwd, p)}가 없습니다.`,
          hint: "`npx expo prebuild --platform android --no-install`을 먼저 실행하세요.",
        });
  }

  if (options.mergedPath !== undefined) {
    const p = path.resolve(cwd, options.mergedPath);
    return existsSync(p) ? ok(p) : err({ message: `${path.relative(cwd, p)}가 없습니다.` });
  }

  const found = findMergedManifests(path.join(cwd, INTERMEDIATES));
  const [only, ...rest] = found;
  if (only === undefined) {
    return err({
      message: `병합된 release 매니페스트를 찾지 못했습니다 (${INTERMEDIATES} 아래).`,
      hint: "`(cd android && ./gradlew :app:processReleaseMainManifest)`를 먼저 실행하세요.",
    });
  }
  if (rest.length > 0) {
    // flavor가 여럿이거나 AGP가 경로를 바꾸면 엉뚱한 파일을 볼 수 있다 — 하나를 골라 통과시키지 않는다.
    const list = found.map((f) => path.relative(cwd, f)).join(", ");
    return err({ message: `병합 매니페스트 후보가 여럿입니다 (${list}).`, hint: "`android.permissions.mergedPath`로 지정하세요." });
  }
  return ok(only);
}

/** AGP 버전마다 경로가 달라 intermediates 아래 `merged_manifest(s)/release` 의 매니페스트를 찾는다. */
export function findMergedManifests(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const hits: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d)) {
      const p = path.join(d, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry === "AndroidManifest.xml" && /merged_manifests?[\\/]release/.test(p)) hits.push(p);
    }
  };
  walk(dir);
  return hits.sort();
}


