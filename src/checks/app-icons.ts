import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { AndroidLauncherAliasesConfig, IosAlternateIconsConfig } from "../config.js";
import { err, ok, type CheckResult, type Problem, type Result } from "../types.js";
import { findInfoPlist } from "./ios-plist.js";
import type { Check } from "./types.js";

/**
 * 대체 앱 아이콘 등록 검사 두 가지.
 *
 * 아이콘 변경은 config plugin이 네이티브 프로젝트 여러 곳을 함께 고쳐야 동작한다. 한 곳만 빠져도
 * 빌드는 통과하고, 사용자가 아이콘을 바꾸는 순간에만 실패한다(iOS는 조용히 무시, Android는 런처에서
 * 앱이 사라지거나 아이콘이 둘로 보인다). 그래서 산출물에서 등록 상태를 본다.
 */
export const iosAlternateIconsCheck: Check = {
  id: "ios-alternate-icons",
  title: "iOS alternate app icon registration in the prebuild output",
  run({ cwd, config }) {
    return Promise.resolve(runIosAlternateIcons(cwd, config.ios?.alternateIcons));
  },
};

export const androidLauncherAliasesCheck: Check = {
  id: "android-launcher-aliases",
  title: "Android launcher aliases (icon switching) in the prebuild output",
  run({ cwd, config }) {
    return Promise.resolve(runAndroidLauncherAliases(cwd, config.android?.launcherAliases));
  },
};

const BUILD_SETTING = "ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES";

export function runIosAlternateIcons(cwd: string, options: IosAlternateIconsConfig | undefined): CheckResult {
  if (!options) return { status: "skip", reason: "no `ios.alternateIcons` config" };

  const project = options.projectPath === undefined ? findPbxproj(cwd) : ok(path.resolve(cwd, options.projectPath));
  if (!project.ok) return failWith(project.error);
  if (!existsSync(project.value)) {
    return failWith(`${path.relative(cwd, project.value)} does not exist.`, "Run `npx expo prebuild --platform ios` first.");
  }

  const problems: Problem[] = [];
  const expected = [...options.names].sort();
  const registered = readAlternateIconNames(readFileSync(project.value, "utf8"));
  if (registered.length === 0) {
    problems.push({
      message: `Build setting ${BUILD_SETTING} is missing.`,
      hint: "The alternate-icon config plugin is missing or did not run. Without this setting, setAlternateIconName fails.",
    });
  }
  for (const names of registered) {
    const got = [...names].sort();
    const missing = expected.filter((n) => !got.includes(n));
    const extra = got.filter((n) => !expected.includes(n));
    if (missing.length > 0 || extra.length > 0) {
      problems.push({
        message: `${BUILD_SETTING} does not match the config (missing: ${missing.join(", ") || "none"} / extra: ${extra.join(", ") || "none"}).`,
        hint: "Every build configuration (Debug, Release) must list the same icons.",
      });
    }
  }

  const catalog = locateAssetCatalog(cwd, options);
  if (!catalog.ok) return failWith(catalog.error);
  for (const name of options.names) {
    const problem = checkIconSet(path.join(catalog.value, `${name}.appiconset`), name);
    if (problem) problems.push(problem);
  }

  const total = options.names.length;
  return problems.length === 0
    ? { status: "pass", summary: `all ${String(total)} alternate icon(s) registered` }
    : { status: "fail", summary: `${String(problems.length)} problem(s) with ${String(total)} alternate icon(s)`, problems };
}

/** pbxproj에서 빌드 구성마다의 대체 아이콘 이름 목록을 읽는다. 값은 `"A B"`, `A`, `( A, "B", )` 꼴이 있다. */
export function readAlternateIconNames(pbxproj: string): string[][] {
  const pattern = new RegExp(`${BUILD_SETTING}\\s*=\\s*(\\([^)]*\\)|"[^"]*"|[^;\\s]+)\\s*;`, "g");
  return [...pbxproj.matchAll(pattern)].map((m) =>
    (m[1] ?? "")
      .replace(/^\(|\)$/g, "")
      .split(/[\s,]+/)
      .map((t) => t.replaceAll('"', "").trim())
      .filter((t) => t !== ""),
  );
}

function checkIconSet(dir: string, name: string): Problem | undefined {
  const contents = path.join(dir, "Contents.json");
  if (!existsSync(contents)) {
    return { message: `${name}.appiconset does not exist.`, hint: "The icon images were not copied into the asset catalog." };
  }
  let images: unknown;
  try {
    images = (JSON.parse(readFileSync(contents, "utf8")) as { images?: unknown }).images;
  } catch (e) {
    return { message: `Could not parse ${name}.appiconset/Contents.json: ${e instanceof Error ? e.message : String(e)}` };
  }
  const files = Array.isArray(images)
    ? images
        .map((img: unknown) => (typeof img === "object" && img !== null ? (img as { filename?: unknown }).filename : undefined))
        .filter((f): f is string => typeof f === "string")
    : [];
  if (!files.some((f) => existsSync(path.join(dir, f)))) {
    return { message: `${name}.appiconset has no actual image file.`, hint: "Check that the files referenced by Contents.json were copied." };
  }
  return undefined;
}

export function findPbxproj(cwd: string): Result<string> {
  const iosDir = path.join(cwd, "ios");
  if (!existsSync(iosDir)) return err("No ios/ directory. Run `npx expo prebuild --platform ios` first.");
  const candidates = readdirSync(iosDir)
    .filter((name) => name.endsWith(".xcodeproj") && name !== "Pods.xcodeproj")
    .map((name) => path.join(iosDir, name, "project.pbxproj"))
    .filter((p) => existsSync(p));
  const [only, ...rest] = candidates;
  if (only === undefined) return err("Could not find ios/*.xcodeproj/project.pbxproj.");
  if (rest.length > 0) {
    return err(`Several project.pbxproj candidates. Set \`ios.alternateIcons.projectPath\`.`);
  }
  return ok(only);
}

function locateAssetCatalog(cwd: string, options: IosAlternateIconsConfig): Result<string> {
  if (options.assetCatalogPath !== undefined) {
    const p = path.resolve(cwd, options.assetCatalogPath);
    return existsSync(p) ? ok(p) : err(`${path.relative(cwd, p)} does not exist.`);
  }
  const plist = findInfoPlist(cwd);
  if (!plist.ok) return err(`Could not find the asset catalog — ${plist.error} You can set \`ios.alternateIcons.assetCatalogPath\`.`);
  const p = path.join(path.dirname(plist.value), "Images.xcassets");
  return existsSync(p) && statSync(p).isDirectory() ? ok(p) : err(`${path.relative(cwd, p)} does not exist.`);
}

const SOURCE_MANIFEST = "android/app/src/main/AndroidManifest.xml";

export function runAndroidLauncherAliases(cwd: string, options: AndroidLauncherAliasesConfig | undefined): CheckResult {
  if (!options) return { status: "skip", reason: "no `android.launcherAliases` config" };
  const manifestPath = path.resolve(cwd, options.manifestPath ?? SOURCE_MANIFEST);
  if (!existsSync(manifestPath)) {
    return failWith(
      `${path.relative(cwd, manifestPath)} does not exist.`,
      "Run `npx expo prebuild --platform android --no-install` first.",
    );
  }

  const xml = readFileSync(manifestPath, "utf8");
  const declared = readActivities(xml, "activity-alias");
  const problems: Problem[] = [];

  for (const alias of options.aliases) {
    const found = declared.find((a) => a.name.endsWith(alias));
    if (!found) {
      problems.push({ message: `Alias ${alias} is missing.`, hint: "Switching to this icon would remove the app from the launcher." });
      continue;
    }
    if (!found.launcher) problems.push({ message: `Alias ${alias} has no LAUNCHER intent-filter.` });
    const shouldEnable = alias === options.enabledByDefault;
    if (found.enabled !== shouldEnable) {
      problems.push({
        message: `Alias ${alias} is ${found.enabled ? "enabled" : "disabled"} by default (expected: ${shouldEnable ? "enabled" : "disabled"}).`,
        hint: "Exactly one alias must be enabled by default. With none the app disappears from the launcher; with two or more it shows several icons.",
      });
    }
  }
  const strayEnabled = declared.filter(
    (a) => a.enabled && a.launcher && !options.aliases.some((alias) => a.name.endsWith(alias)),
  );
  for (const a of strayEnabled) {
    problems.push({ message: `Alias ${a.name} is not in the config but is an enabled launcher.`, hint: "It shows an extra icon." });
  }

  const mainName = options.mainActivity ?? ".MainActivity";
  const main = readActivities(xml, "activity").find((a) => a.name.endsWith(mainName));
  if (!main) {
    problems.push({ message: `Main activity (${mainName}) not found.`, hint: "Set `android.launcherAliases.mainActivity`." });
  } else {
    if (main.launcher) {
      problems.push({ message: "The main activity still has a LAUNCHER intent-filter.", hint: "Together with the aliases it shows two icons." });
    }
    if (!main.enabled) {
      problems.push({ message: "The main activity is disabled.", hint: "Deep links and notifications can no longer open the app." });
    }
    for (const action of options.mainActivityActions ?? []) {
      if (!main.actions.includes(action)) {
        problems.push({
          message: `The main activity lost its ${action} intent-filter.`,
          hint: "Moving the launcher to aliases must not remove the main activity's other entry points (deep links, notifications).",
        });
      }
    }
  }

  const total = options.aliases.length;
  return problems.length === 0
    ? { status: "pass", summary: `${String(total)} launcher alias(es), default ${options.enabledByDefault}` }
    : { status: "fail", summary: `${String(problems.length)} problem(s) with ${String(total)} launcher alias(es)`, problems };
}

interface Activity {
  readonly name: string;
  readonly enabled: boolean;
  readonly launcher: boolean;
  /** intent-filter 안의 `<action android:name>` 값 */
  readonly actions: readonly string[];
}

/** `<activity>`·`<activity-alias>` 요소의 이름·enabled·LAUNCHER 여부를 읽는다. */
export function readActivities(xml: string, tag: "activity" | "activity-alias"): Activity[] {
  // `[\s/>]`로 끊는다 — `activity`가 `activity-alias`의 앞부분과 겹치지 않게.
  const pattern = new RegExp(`<${tag}[\\s/>]([^>]*?)(/>|>([\\s\\S]*?)</${tag}>)`, "g");
  return [...xml.matchAll(pattern)].map((m) => {
    const attrs = m[1] ?? "";
    const body = m[3] ?? "";
    return {
      name: /android:name\s*=\s*"([^"]+)"/.exec(attrs)?.[1] ?? "",
      // android:enabled 생략은 켜짐이다.
      enabled: !/android:enabled\s*=\s*"false"/.test(attrs),
      launcher: body.includes("android.intent.category.LAUNCHER"),
      actions: [...body.matchAll(/<action\s[^>]*android:name\s*=\s*"([^"]+)"/g)].map((a) => a[1] ?? ""),
    };
  });
}

function failWith(message: string, hint?: string): CheckResult {
  return { status: "fail", summary: message, problems: [hint === undefined ? { message } : { message, hint }] };
}
