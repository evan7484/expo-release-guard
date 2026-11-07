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

export interface Config {
  readonly ios?: {
    readonly infoPlist?: IosInfoPlistConfig;
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
  const { ios } = raw;
  if (ios === undefined) return ok({});
  if (!isRecord(ios)) return err("`ios`는 객체여야 합니다.");

  const { infoPlist } = ios;
  if (infoPlist === undefined) return ok({ ios: {} });
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

  const seen = new Set<string>();
  for (const { key } of keys) {
    if (seen.has(key)) return err(`\`ios.infoPlist.requiredKeys\`에 ${key}가 중복됩니다.`);
    seen.add(key);
  }

  return ok({ ios: { infoPlist: plistPath === undefined ? { requiredKeys: keys } : { path: plistPath, requiredKeys: keys } } });
}
