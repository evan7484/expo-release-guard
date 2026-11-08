import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { err, ok, type Result } from "./types.js";

/** 없으면 앱이 죽거나 기능이 막히는 Info.plist 키와, 그 키가 필요한 이유 */
export interface RequiredKey {
  readonly key: string;
  readonly reason: string;
}

/**
 * Info.plist에 있으면 안 되는 키 또는 값. `values`가 없으면 키 자체가 없어야 하고, 있으면 키의 값
 * (문자열이나 문자열 배열)이 그 중 어느 것도 담으면 안 된다 — 예: `UIBackgroundModes`에 `processing`.
 * 다른 플랫폼용 플러그인이 iOS 권한·백그라운드 모드를 끌어오면 심사에서 사유를 요구받는다.
 */
export interface ForbiddenPlistEntry {
  readonly key: string;
  readonly values?: readonly string[];
  readonly reason: string;
}

export interface IosInfoPlistConfig {
  /** cwd 기준 Info.plist 경로. 생략하면 `ios/<앱 이름>/Info.plist`를 찾는다. */
  readonly path?: string;
  /** 설정 파일에서는 생략할 수 있다 — 읽을 때 빈 배열로 채운다. */
  readonly requiredKeys: readonly RequiredKey[];
  readonly forbidden?: readonly ForbiddenPlistEntry[];
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

/**
 * iOS 대체 앱 아이콘. config plugin이 등록하는 두 곳 — 빌드 설정
 * `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES`와 에셋 카탈로그의 `<이름>.appiconset` — 이
 * 둘 다 맞아야 `setAlternateIconName`이 동작한다. 하나만 빠지면 빌드는 통과하고 아이콘 변경만 실패한다.
 */
export interface IosAlternateIconsConfig {
  readonly names: readonly string[];
  /** cwd 기준 project.pbxproj 경로. 생략하면 `ios/*.xcodeproj/project.pbxproj`를 찾는다. */
  readonly projectPath?: string;
  /** cwd 기준 에셋 카탈로그(.xcassets) 경로. 생략하면 Info.plist 옆의 `Images.xcassets`. */
  readonly assetCatalogPath?: string;
}

/**
 * Android 런처 별칭(activity-alias)으로 아이콘을 바꾸는 구성. 별칭마다 LAUNCHER intent-filter가
 * 있어야 하고, 켜진 별칭은 정확히 하나여야 한다(0개면 런처에서 앱이 사라지고, 2개 이상이면 아이콘이 여럿).
 * 메인 액티비티에 LAUNCHER가 남아 있으면 아이콘이 하나 더 생긴다.
 */
export interface AndroidLauncherAliasesConfig {
  /** 별칭의 `android:name` 끝부분 (예: `MainActivityDefault`) */
  readonly aliases: readonly string[];
  /** 기본으로 켜져 있어야 하는 별칭 — `aliases` 중 하나 */
  readonly enabledByDefault: string;
  /** 메인 액티비티 `android:name` 끝부분. 기본 `.MainActivity` */
  readonly mainActivity?: string;
  /** cwd 기준 매니페스트 경로. 기본 `android/app/src/main/AndroidManifest.xml` */
  readonly manifestPath?: string;
  /**
   * 메인 액티비티가 계속 가져야 하는 intent action (예: 딥링크용 `android.intent.action.VIEW`).
   * 런처를 별칭으로 옮기면서 메인 액티비티의 intent-filter를 통째로 지우면 딥링크·알림 진입이 끊긴다.
   */
  readonly mainActivityActions?: readonly string[];
}

export interface Config {
  readonly ios?: {
    readonly infoPlist?: IosInfoPlistConfig;
    readonly alternateIcons?: IosAlternateIconsConfig;
  };
  readonly android?: {
    readonly permissions?: AndroidPermissionsConfig;
    readonly launcherAliases?: AndroidLauncherAliasesConfig;
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
        ? `Config file not found: ${explicitPath}`
        : `No config file found. Create one of ${CONFIG_FILENAMES.join(", ")} (or run \`expo-release-guard init\`).`,
    );
  }

  let raw: unknown;
  try {
    raw = file.endsWith(".json")
      ? (JSON.parse(readFileSync(file, "utf8")) as unknown)
      : ((await import(pathToFileURL(file).href)) as { default?: unknown }).default;
  } catch (e) {
    return err(`Could not read the config file (${path.relative(cwd, file)}): ${e instanceof Error ? e.message : String(e)}`);
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
  if (!isRecord(raw)) return err("The config must be an object.");

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
  if (!isRecord(ios)) return err("`ios` must be an object.");

  const icons = parseAlternateIcons(ios["alternateIcons"]);
  if (!icons.ok) return icons;
  const withIcons = icons.value === undefined ? {} : { alternateIcons: icons.value };
  const { infoPlist } = ios;
  if (infoPlist === undefined) return ok(withIcons);
  if (!isRecord(infoPlist)) return err("`ios.infoPlist` must be an object.");

  const { path: plistPath } = infoPlist;
  const requiredKeys = infoPlist["requiredKeys"] ?? [];
  if (plistPath !== undefined && typeof plistPath !== "string") return err("`ios.infoPlist.path` must be a string.");
  if (!Array.isArray(requiredKeys)) return err("`ios.infoPlist.requiredKeys` must be an array.");

  const keys: RequiredKey[] = [];
  for (const [i, item] of requiredKeys.entries()) {
    if (!isRecord(item) || typeof item["key"] !== "string" || typeof item["reason"] !== "string") {
      return err(`\`ios.infoPlist.requiredKeys[${String(i)}]\` must be { key: string, reason: string }.`);
    }
    if (item["key"].trim() === "") return err(`\`ios.infoPlist.requiredKeys[${String(i)}].key\` is empty.`);
    keys.push({ key: item["key"], reason: item["reason"] });
  }

  const dup = firstDuplicate(keys.map((k) => k.key));
  if (dup !== undefined) return err(`\`ios.infoPlist.requiredKeys\` lists ${dup} more than once.`);

  const forbidden = parseForbiddenPlist(infoPlist["forbidden"]);
  if (!forbidden.ok) return forbidden;
  const clash = forbidden.value.find((f) => f.values === undefined && keys.some((k) => k.key === f.key));
  if (clash) return err(`\`ios.infoPlist\`: ${clash.key} is both required and forbidden.`);

  return ok({
    ...withIcons,
    infoPlist: {
      ...(plistPath === undefined ? {} : { path: plistPath }),
      requiredKeys: keys,
      ...(forbidden.value.length > 0 ? { forbidden: forbidden.value } : {}),
    },
  });
}

function parseForbiddenPlist(raw: unknown): Result<ForbiddenPlistEntry[]> {
  if (raw === undefined) return ok([]);
  const where = "ios.infoPlist.forbidden";
  if (!Array.isArray(raw)) return err(`\`${where}\` must be an array.`);
  const entries: ForbiddenPlistEntry[] = [];
  for (const [i, item] of raw.entries()) {
    const at = `\`${where}[${String(i)}]\``;
    if (!isRecord(item) || typeof item["key"] !== "string" || typeof item["reason"] !== "string") {
      return err(`${at} must be { key: string, reason: string, values?: string[] }.`);
    }
    if (item["key"].trim() === "") return err(`${at}.key is empty.`);
    const values = item["values"];
    if (values === undefined) {
      entries.push({ key: item["key"], reason: item["reason"] });
      continue;
    }
    const parsed = parseNames(values, `${where}[${String(i)}].values`);
    if (!parsed.ok) return parsed;
    entries.push({ key: item["key"], values: parsed.value, reason: item["reason"] });
  }
  return ok(entries);
}

function parseAndroid(android: unknown): Result<Config["android"]> {
  if (android === undefined) return ok(undefined);
  if (!isRecord(android)) return err("`android` must be an object.");

  const aliases = parseLauncherAliases(android["launcherAliases"]);
  if (!aliases.ok) return aliases;
  const withAliases = aliases.value === undefined ? {} : { launcherAliases: aliases.value };
  const { permissions } = android;
  if (permissions === undefined) return ok(withAliases);
  if (!isRecord(permissions)) return err("`android.permissions` must be an object.");

  const where = "android.permissions";
  for (const key of ["sourcePath", "mergedPath"] as const) {
    const v = permissions[key];
    if (v !== undefined && typeof v !== "string") return err(`\`${where}.${key}\` must be a string.`);
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
  if (clash) return err(`\`${where}\`: ${clash.name} is both required and forbidden.`);

  const sourcePath = permissions["sourcePath"];
  const mergedPath = permissions["mergedPath"];
  return ok({
    ...withAliases,
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
  if (!Array.isArray(raw)) return err(`\`${where}\` must be an array.`);

  const rules: ForbiddenPermissionRule[] = [];
  for (const [i, item] of raw.entries()) {
    const at = `\`${where}[${String(i)}]\``;
    if (!isRecord(item) || typeof item["name"] !== "string" || typeof item["reason"] !== "string") {
      return err(`${at} must be { name: string, reason: string }.`);
    }
    if (item["name"].trim() === "") return err(`${at}.name is empty.`);
    const blocked = item["blockedInSource"];
    if (blocked !== undefined) {
      if (!allowBlocked) return err(`${at}.blockedInSource is only allowed in forbidden.`);
      if (typeof blocked !== "boolean") return err(`${at}.blockedInSource must be a boolean.`);
    }
    rules.push(
      blocked === true
        ? { name: item["name"], reason: item["reason"], blockedInSource: true }
        : { name: item["name"], reason: item["reason"] },
    );
  }

  const dup = firstDuplicate(rules.map((r) => normalizePermission(r.name)));
  if (dup !== undefined) return err(`\`${where}\` lists ${dup} more than once.`);
  return ok(rules);
}

function parseNames(raw: unknown, where: string): Result<string[]> {
  if (!Array.isArray(raw) || raw.length === 0) return err(`\`${where}\` must be a non-empty array of strings.`);
  const names: string[] = [];
  for (const [i, item] of raw.entries()) {
    if (typeof item !== "string" || item.trim() === "") {
      return err(`\`${where}[${String(i)}]\` must be a non-empty string.`);
    }
    names.push(item.trim());
  }
  const dup = firstDuplicate(names);
  if (dup !== undefined) return err(`\`${where}\` lists ${dup} more than once.`);
  return ok(names);
}

function optionalString(record: Record<string, unknown>, key: string, where: string): Result<string | undefined> {
  const v = record[key];
  if (v === undefined) return ok(undefined);
  return typeof v === "string" && v.trim() !== "" ? ok(v) : err(`\`${where}.${key}\` must be a non-empty string.`);
}

function parseAlternateIcons(raw: unknown): Result<IosAlternateIconsConfig | undefined> {
  if (raw === undefined) return ok(undefined);
  const where = "ios.alternateIcons";
  if (!isRecord(raw)) return err(`\`${where}\` must be an object.`);
  const names = parseNames(raw["names"], `${where}.names`);
  if (!names.ok) return names;
  const projectPath = optionalString(raw, "projectPath", where);
  if (!projectPath.ok) return projectPath;
  const assetCatalogPath = optionalString(raw, "assetCatalogPath", where);
  if (!assetCatalogPath.ok) return assetCatalogPath;
  return ok({
    names: names.value,
    ...(projectPath.value === undefined ? {} : { projectPath: projectPath.value }),
    ...(assetCatalogPath.value === undefined ? {} : { assetCatalogPath: assetCatalogPath.value }),
  });
}

function parseLauncherAliases(raw: unknown): Result<AndroidLauncherAliasesConfig | undefined> {
  if (raw === undefined) return ok(undefined);
  const where = "android.launcherAliases";
  if (!isRecord(raw)) return err(`\`${where}\` must be an object.`);
  const aliases = parseNames(raw["aliases"], `${where}.aliases`);
  if (!aliases.ok) return aliases;
  const enabled = raw["enabledByDefault"];
  if (typeof enabled !== "string" || !aliases.value.includes(enabled)) {
    return err(`\`${where}.enabledByDefault\` must be one of aliases.`);
  }
  const mainActivity = optionalString(raw, "mainActivity", where);
  if (!mainActivity.ok) return mainActivity;
  const manifestPath = optionalString(raw, "manifestPath", where);
  if (!manifestPath.ok) return manifestPath;
  const actionsRaw = raw["mainActivityActions"];
  const actions = actionsRaw === undefined ? ok(undefined) : parseNames(actionsRaw, `${where}.mainActivityActions`);
  if (!actions.ok) return actions;
  return ok({
    aliases: aliases.value,
    enabledByDefault: enabled,
    ...(mainActivity.value === undefined ? {} : { mainActivity: mainActivity.value }),
    ...(manifestPath.value === undefined ? {} : { manifestPath: manifestPath.value }),
    ...(actions.value === undefined ? {} : { mainActivityActions: actions.value }),
  });
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
