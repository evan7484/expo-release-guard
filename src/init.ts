import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { findMergedManifests, isRemoved, readPermissions } from "./checks/android-manifest.js";
import { findPbxproj, readActivities, readAlternateIconNames } from "./checks/app-icons.js";
import { findInfoPlist } from "./checks/ios-plist.js";
import type { Config, ForbiddenPermissionRule, PermissionRule, RequiredKey } from "./config.js";
import { parsePlist } from "./plist.js";
import { err, ok, type Result } from "./types.js";

/** 사람이 채워야 하는 이유. 실패 메시지에 그대로 보이므로 비워 두지 않게 눈에 띄는 값으로 둔다. */
export const TODO_REASON = "TODO: why must this stay? (shown in the failure message)";

export interface InitDraft {
  readonly config: Config;
  /** 무엇을 찾았고 무엇을 손봐야 하는지 — 사람에게 보여 줄 줄 */
  readonly notes: readonly string[];
}

const SOURCE_MANIFEST = "android/app/src/main/AndroidManifest.xml";
const USAGE_KEY = /^NS\w+UsageDescription$/;

/**
 * 지금 prebuild 산출물을 읽어 설정 초안을 만든다. "지금 상태"를 기준선으로 고정하는 것이 목적이라,
 * 있는 권한 문구·권한·아이콘 등록을 그대로 required로 적고, 제거 지시자가 붙은 권한만 forbidden으로 적는다.
 * 무엇을 금지할지(위치·연락처 등)는 산출물이 말해 주지 않으므로 사람이 더한다.
 */
export function buildInitialConfig(cwd: string): Result<InitDraft> {
  const notes: string[] = [];
  const ios = draftIos(cwd, notes);
  const android = draftAndroid(cwd, notes);
  if (ios === undefined && android === undefined) {
    return err(
      "No ios/ or android/ output found. Run `npx expo prebuild --no-install` first (and `./gradlew :app:processReleaseMainManifest` to include library permissions from the merged manifest).",
    );
  }
  const config: Config = {
    ...(ios === undefined ? {} : { ios }),
    ...(android === undefined ? {} : { android }),
  };
  notes.push(`Replace every "${TODO_REASON}" reason — it is what the next person reads when the check fails.`);
  return ok({ config, notes });
}

function draftIos(cwd: string, notes: string[]): Config["ios"] {
  const plistPath = findInfoPlist(cwd);
  if (!plistPath.ok) return undefined;

  let requiredKeys: RequiredKey[] = [];
  try {
    const info = parsePlist(readFileSync(plistPath.value, "utf8"));
    if (typeof info === "object" && info !== null && !Array.isArray(info)) {
      requiredKeys = Object.entries(info as Record<string, unknown>)
        .filter(([key, value]) => USAGE_KEY.test(key) && typeof value === "string" && value.trim() !== "")
        .map(([key]) => ({ key, reason: TODO_REASON }))
        .sort((a, b) => a.key.localeCompare(b.key));
    }
  } catch {
    notes.push(`Could not parse ${path.relative(cwd, plistPath.value)}; skipped usage descriptions.`);
  }
  notes.push(`iOS: ${String(requiredKeys.length)} usage description(s) (${path.relative(cwd, plistPath.value)})`);

  const project = findPbxproj(cwd);
  const iconNames = project.ok ? (readAlternateIconNames(readFileSync(project.value, "utf8"))[0] ?? []) : [];
  if (iconNames.length > 0) notes.push(`iOS: ${String(iconNames.length)} alternate icon(s)`);

  return {
    infoPlist: { requiredKeys },
    ...(iconNames.length > 0 ? { alternateIcons: { names: [...iconNames].sort() } } : {}),
  };
}

function draftAndroid(cwd: string, notes: string[]): Config["android"] {
  const sourcePath = path.join(cwd, SOURCE_MANIFEST);
  if (!existsSync(sourcePath)) return undefined;
  const sourceXml = readFileSync(sourcePath, "utf8");
  const source = readPermissions(sourceXml);

  const required: PermissionRule[] = [];
  const forbidden: ForbiddenPermissionRule[] = [];
  for (const [name, tag] of [...source].sort(([a], [b]) => a.localeCompare(b))) {
    const short = shortPermission(name);
    if (isRemoved(tag)) forbidden.push({ name: short, reason: TODO_REASON, blockedInSource: true });
    else required.push({ name: short, reason: TODO_REASON });
  }
  notes.push(`Android: ${String(required.length)} permission(s) in the source manifest, ${String(forbidden.length)} removal directive(s)`);

  // 병합본이 있으면 라이브러리가 넣은 권한(소스에 없는 것)을 requiredMerged로 고정한다.
  const requiredMerged: PermissionRule[] = [];
  const [merged, ...others] = findMergedManifests(path.join(cwd, "android/app/build/intermediates"));
  if (merged !== undefined && others.length === 0) {
    for (const [name, tag] of [...readPermissions(readFileSync(merged, "utf8"))].sort(([a], [b]) => a.localeCompare(b))) {
      if (!source.has(name) && !isRemoved(tag)) requiredMerged.push({ name: shortPermission(name), reason: TODO_REASON });
    }
    notes.push(`Android: ${String(requiredMerged.length)} permission(s) only in the merged manifest — keep the ones you want from libraries and move the rest to forbidden.`);
  } else {
    notes.push(
      merged === undefined
        ? "Android: no merged manifest, so requiredMerged (library permissions) is empty. Re-run after Gradle `:app:processReleaseMainManifest` to fill it."
        : "Android: several merged manifest candidates, so requiredMerged is empty.",
    );
  }

  const aliases = readActivities(sourceXml, "activity-alias").filter((a) => a.launcher);
  const enabled = aliases.filter((a) => a.enabled);
  // 런처를 별칭으로 옮긴 앱이면, 메인 액티비티에 남은 진입점(딥링크 VIEW 등)도 지금 상태로 고정한다.
  const mainActions =
    readActivities(sourceXml, "activity")
      .find((a) => a.name.endsWith(".MainActivity"))
      ?.actions.filter((a) => a !== "android.intent.action.MAIN") ?? [];
  const launcherAliases =
    aliases.length > 0 && enabled.length === 1 && enabled[0] !== undefined
      ? {
          aliases: aliases.map((a) => lastSegment(a.name)),
          enabledByDefault: lastSegment(enabled[0].name),
          ...(mainActions.length > 0 ? { mainActivityActions: [...new Set(mainActions)].sort() } : {}),
        }
      : undefined;
  if (launcherAliases) notes.push(`Android: ${String(launcherAliases.aliases.length)} launcher alias(es)`);
  else if (aliases.length > 0) notes.push(`Android: launcher aliases found, but ${String(enabled.length)} are enabled, so they were left out.`);

  return {
    permissions: { required, ...(requiredMerged.length > 0 ? { requiredMerged } : {}), forbidden },
    ...(launcherAliases ? { launcherAliases } : {}),
  };
}

/** `android.permission.CAMERA` → `CAMERA`. 다른 네임스페이스(광고 ID 등)는 그대로 둔다. */
const shortPermission = (name: string): string =>
  name.startsWith("android.permission.") ? name.slice("android.permission.".length) : name;

const lastSegment = (name: string): string => name.slice(name.lastIndexOf(".") + 1);
