import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { err, ok, type Result } from "./types.js";

/** 없으면 앱이 죽거나 기능이 막히는 Info.plist 키와, 그 키가 필요한 이유 */
export interface RequiredKey {
  readonly key: string;
  readonly reason: string;
}

export interface IosInfoPlistConfig {
  /** cwd 기준 Info.plist 경로. 생략하면 `ios/<앱 이름>/Info.plist`를 찾는다. */
  readonly path?: string;
  readonly requiredKeys: readonly RequiredKey[];
}

/**
 * Android 권한 규칙. `name`은 `CAMERA`처럼 짧게 쓰면 `android.permission.CAMERA`로,
 * `com.google.android.gms.permission.AD_ID`처럼 점이 있으면 그대로 본다.
 */
export interface PermissionRule {
  readonly name: string;
  readonly reason: string;
}

export interface ForbiddenPermissionRule extends PermissionRule {
  /**
   * app.json `android.blockedPermissions`로 막는 권한이면 true.
   * 소스 매니페스트에서는 "없음"이 아니라 `tools:node="remove"` 제거 지시자가 붙어 있어야 한다 —
   * 설정이 빠지면 항목이 소스에서 사라지고, 병합 때 라이브러리 매니페스트에서 조용히 되살아난다.
   */
  readonly blockedInSource?: boolean;
}

export interface AndroidPermissionsConfig {
  /** 소스·병합 매니페스트 모두에 있어야 하는 권한 (앱이 직접 선언) */
  readonly required?: readonly PermissionRule[];
  /** 병합 매니페스트에만 있으면 되는 권한 (라이브러리가 자기 매니페스트로 넣는 것) */
  readonly requiredMerged?: readonly PermissionRule[];
  /** 최종 앱에 남으면 안 되는 권한 */
  readonly forbidden?: readonly ForbiddenPermissionRule[];
  /** 소스 매니페스트 경로. 기본 `android/app/src/main/AndroidManifest.xml` */
  readonly sourcePath?: string;
  /** 병합 매니페스트 경로. 생략하면 `android/app/build/intermediates` 아래 release 병합본을 찾는다. */
  readonly mergedPath?: string;
}

export interface Config {
  readonly ios?: {
    readonly infoPlist?: IosInfoPlistConfig;
  };
  readonly android?: {
    readonly permissions?: AndroidPermissionsConfig;
  };
}

/** 설정 파일에서 타입 추론을 받기 위한 항등 함수 */
export function defineConfig(config: Config): Config {
  return config;
}

export const CONFIG_FILENAMES = [
  "release-guard.config.json",
  "release-guard.config.js",
  "release-guard.config.mjs",
] as const;

/** 설정 파일을 찾아 읽고 검증한다. `explicitPath`가 있으면 그 파일만 본다. */
export async function loadConfig(cwd: string, explicitPath?: string): Promise<Result<{ config: Config; file: string }>> {
  const candidates = explicitPath ? [path.resolve(cwd, explicitPath)] : CONFIG_FILENAMES.map((f) => path.join(cwd, f));
  const file = candidates.find((f) => existsSync(f));
  if (!file) {
    return err(
      explicitPath
        ? `설정 파일이 없습니다: ${explicitPath}`
        : `설정 파일이 없습니다. ${CONFIG_FILENAMES.join(", ")} 중 하나를 만드세요.`,
    );
  }

  let raw: unknown;
  try {
    raw = file.endsWith(".json")
      ? (JSON.parse(readFileSync(file, "utf8")) as unknown)
      : ((await import(pathToFileURL(file).href)) as { default?: unknown }).default;
  } catch (e) {
    return err(`설정 파일을 읽지 못했습니다 (${path.relative(cwd, file)}): ${e instanceof Error ? e.message : String(e)}`);
  }

  const parsed = parseConfig(raw);
  return parsed.ok ? ok({ config: parsed.value, file }) : err(`${path.relative(cwd, file)}: ${parsed.error}`);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * 외부 입력(JSON·JS)을 Config로 좁힌다. 검사 단계에서 타입을 다시 의심하지 않도록
 * 모양이 틀리면 여기서 어디가 틀렸는지 알려 주고 끝낸다.
 */
export function parseConfig(raw: unknown): Result<Config> {
  if (!isRecord(raw)) return err("설정은 객체여야 합니다.");

  const ios = parseIos(raw["ios"]);
  if (!ios.ok) return ios;
  const android = parseAndroid(raw["android"]);
  if (!android.ok) return android;

  return ok({
    ...(ios.value === undefined ? {} : { ios: ios.value }),
    ...(android.value === undefined ? {} : { android: android.value }),
  });
}

function parseIos(ios: unknown): Result<Config["ios"]> {
  if (ios === undefined) return ok(undefined);
  if (!isRecord(ios)) return err("`ios`는 객체여야 합니다.");

  const { infoPlist } = ios;
  if (infoPlist === undefined) return ok({});
  if (!isRecord(infoPlist)) return err("`ios.infoPlist`는 객체여야 합니다.");

  const { path: plistPath, requiredKeys } = infoPlist;
  if (plistPath !== undefined && typeof plistPath !== "string") return err("`ios.infoPlist.path`는 문자열이어야 합니다.");
  if (!Array.isArray(requiredKeys)) return err("`ios.infoPlist.requiredKeys`는 배열이어야 합니다.");

  const keys: RequiredKey[] = [];
  for (const [i, item] of requiredKeys.entries()) {
    if (!isRecord(item) || typeof item["key"] !== "string" || typeof item["reason"] !== "string") {
      return err(`\`ios.infoPlist.requiredKeys[${String(i)}]\`는 { key: string, reason: string } 이어야 합니다.`);
    }
    if (item["key"].trim() === "") return err(`\`ios.infoPlist.requiredKeys[${String(i)}].key\`가 비었습니다.`);
    keys.push({ key: item["key"], reason: item["reason"] });
  }

  const dup = firstDuplicate(keys.map((k) => k.key));
  if (dup !== undefined) return err(`\`ios.infoPlist.requiredKeys\`에 ${dup}가 중복됩니다.`);

  return ok({ infoPlist: plistPath === undefined ? { requiredKeys: keys } : { path: plistPath, requiredKeys: keys } });
}

function parseAndroid(android: unknown): Result<Config["android"]> {
  if (android === undefined) return ok(undefined);
  if (!isRecord(android)) return err("`android`는 객체여야 합니다.");

  const { permissions } = android;
  if (permissions === undefined) return ok({});
  if (!isRecord(permissions)) return err("`android.permissions`는 객체여야 합니다.");

  const where = "android.permissions";
  for (const key of ["sourcePath", "mergedPath"] as const) {
    const v = permissions[key];
    if (v !== undefined && typeof v !== "string") return err(`\`${where}.${key}\`는 문자열이어야 합니다.`);
  }

  const required = parseRules(permissions["required"], `${where}.required`, false);
  if (!required.ok) return required;
  const requiredMerged = parseRules(permissions["requiredMerged"], `${where}.requiredMerged`, false);
  if (!requiredMerged.ok) return requiredMerged;
  const forbidden = parseRules(permissions["forbidden"], `${where}.forbidden`, true);
  if (!forbidden.ok) return forbidden;

  // 같은 권한을 "있어야 한다"와 "있으면 안 된다"에 동시에 두면 어느 쪽으로도 통과할 수 없다.
  const wanted = new Set([...required.value, ...requiredMerged.value].map((r) => normalizePermission(r.name)));
  const clash = forbidden.value.find((r) => wanted.has(normalizePermission(r.name)));
  if (clash) return err(`\`${where}\`: ${clash.name}가 required와 forbidden에 함께 있습니다.`);

  const sourcePath = permissions["sourcePath"];
  const mergedPath = permissions["mergedPath"];
  return ok({
    permissions: {
      required: required.value,
      requiredMerged: requiredMerged.value,
      forbidden: forbidden.value,
      ...(typeof sourcePath === "string" ? { sourcePath } : {}),
      ...(typeof mergedPath === "string" ? { mergedPath } : {}),
    },
  });
}

function parseRules(raw: unknown, where: string, allowBlocked: boolean): Result<ForbiddenPermissionRule[]> {
  if (raw === undefined) return ok([]);
  if (!Array.isArray(raw)) return err(`\`${where}\`는 배열이어야 합니다.`);

  const rules: ForbiddenPermissionRule[] = [];
  for (const [i, item] of raw.entries()) {
    const at = `\`${where}[${String(i)}]\``;
    if (!isRecord(item) || typeof item["name"] !== "string" || typeof item["reason"] !== "string") {
      return err(`${at}는 { name: string, reason: string } 이어야 합니다.`);
    }
    if (item["name"].trim() === "") return err(`${at}.name이 비었습니다.`);
    const blocked = item["blockedInSource"];
    if (blocked !== undefined) {
      if (!allowBlocked) return err(`${at}.blockedInSource는 forbidden에서만 쓸 수 있습니다.`);
      if (typeof blocked !== "boolean") return err(`${at}.blockedInSource는 boolean이어야 합니다.`);
    }
    rules.push(
      blocked === true
        ? { name: item["name"], reason: item["reason"], blockedInSource: true }
        : { name: item["name"], reason: item["reason"] },
    );
  }

  const dup = firstDuplicate(rules.map((r) => normalizePermission(r.name)));
  if (dup !== undefined) return err(`\`${where}\`에 ${dup}가 중복됩니다.`);
  return ok(rules);
}

/** `CAMERA` → `android.permission.CAMERA`. 점이 있으면 이미 전체 이름으로 본다. */
export function normalizePermission(name: string): string {
  const trimmed = name.trim();
  return trimmed.includes(".") ? trimmed : `android.permission.${trimmed}`;
}

function firstDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) return v;
    seen.add(v);
  }
  return undefined;
}
