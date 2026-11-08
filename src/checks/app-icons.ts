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
  title: "prebuild 산출물의 iOS 대체 앱 아이콘 등록",
  run({ cwd, config }) {
    return Promise.resolve(runIosAlternateIcons(cwd, config.ios?.alternateIcons));
  },
};

export const androidLauncherAliasesCheck: Check = {
  id: "android-launcher-aliases",
  title: "prebuild 산출물의 Android 런처 별칭(아이콘 변경)",
  run({ cwd, config }) {
    return Promise.resolve(runAndroidLauncherAliases(cwd, config.android?.launcherAliases));
  },
};

const BUILD_SETTING = "ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES";

export function runIosAlternateIcons(cwd: string, options: IosAlternateIconsConfig | undefined): CheckResult {
  if (!options) return { status: "skip", reason: "`ios.alternateIcons` 설정이 없습니다." };

  const project = options.projectPath === undefined ? findPbxproj(cwd) : ok(path.resolve(cwd, options.projectPath));
  if (!project.ok) return failWith(project.error);
  if (!existsSync(project.value)) {
    return failWith(`${path.relative(cwd, project.value)}가 없습니다.`, "`npx expo prebuild --platform ios`를 먼저 실행하세요.");
  }

  const problems: Problem[] = [];
  const expected = [...options.names].sort();
  const registered = readAlternateIconNames(readFileSync(project.value, "utf8"));
  if (registered.length === 0) {
    problems.push({
      message: `빌드 설정 ${BUILD_SETTING}이 없습니다.`,
      hint: "대체 아이콘 config plugin이 빠졌거나 실행되지 않았습니다. 이 설정이 없으면 setAlternateIconName이 실패합니다.",
    });
  }
  for (const names of registered) {
    const got = [...names].sort();
    const missing = expected.filter((n) => !got.includes(n));
    const extra = got.filter((n) => !expected.includes(n));
    if (missing.length > 0 || extra.length > 0) {
      problems.push({
        message: `${BUILD_SETTING}가 설정과 다릅니다 (누락: ${missing.join(", ") || "없음"} / 추가: ${extra.join(", ") || "없음"}).`,
        hint: "빌드 구성(Debug·Release)마다 같은 목록이어야 합니다.",
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
    ? { status: "pass", summary: `대체 아이콘 ${String(total)}개 모두 등록됨` }
    : { status: "fail", summary: `대체 아이콘 ${String(total)}개 중 문제 ${String(problems.length)}건`, problems };
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
    return { message: `${name}.appiconset이 없습니다.`, hint: "아이콘 이미지가 에셋 카탈로그에 복사되지 않았습니다." };
  }
  let images: unknown;
  try {
    images = (JSON.parse(readFileSync(contents, "utf8")) as { images?: unknown }).images;
  } catch (e) {
    return { message: `${name}.appiconset/Contents.json을 해석하지 못했습니다: ${e instanceof Error ? e.message : String(e)}` };
  }
  const files = Array.isArray(images)
    ? images
        .map((img: unknown) => (typeof img === "object" && img !== null ? (img as { filename?: unknown }).filename : undefined))
        .filter((f): f is string => typeof f === "string")
    : [];
  if (!files.some((f) => existsSync(path.join(dir, f)))) {
    return { message: `${name}.appiconset에 실제 이미지 파일이 없습니다.`, hint: "Contents.json이 가리키는 파일이 복사됐는지 확인하세요." };
  }
  return undefined;
}

export function findPbxproj(cwd: string): Result<string> {
  const iosDir = path.join(cwd, "ios");
  if (!existsSync(iosDir)) return err("ios/ 디렉터리가 없습니다. `npx expo prebuild --platform ios`를 먼저 실행하세요.");
  const candidates = readdirSync(iosDir)
    .filter((name) => name.endsWith(".xcodeproj") && name !== "Pods.xcodeproj")
    .map((name) => path.join(iosDir, name, "project.pbxproj"))
    .filter((p) => existsSync(p));
  const [only, ...rest] = candidates;
  if (only === undefined) return err("ios/*.xcodeproj/project.pbxproj를 찾지 못했습니다.");
  if (rest.length > 0) {
    return err(`project.pbxproj 후보가 여럿입니다. \`ios.alternateIcons.projectPath\`로 지정하세요.`);
  }
  return ok(only);
}

function locateAssetCatalog(cwd: string, options: IosAlternateIconsConfig): Result<string> {
  if (options.assetCatalogPath !== undefined) {
    const p = path.resolve(cwd, options.assetCatalogPath);
    return existsSync(p) ? ok(p) : err(`${path.relative(cwd, p)}가 없습니다.`);
  }
  const plist = findInfoPlist(cwd);
  if (!plist.ok) return err(`에셋 카탈로그를 찾지 못했습니다 — ${plist.error} \`ios.alternateIcons.assetCatalogPath\`로 지정할 수 있습니다.`);
  const p = path.join(path.dirname(plist.value), "Images.xcassets");
  return existsSync(p) && statSync(p).isDirectory() ? ok(p) : err(`${path.relative(cwd, p)}가 없습니다.`);
}

const SOURCE_MANIFEST = "android/app/src/main/AndroidManifest.xml";

export function runAndroidLauncherAliases(cwd: string, options: AndroidLauncherAliasesConfig | undefined): CheckResult {
  if (!options) return { status: "skip", reason: "`android.launcherAliases` 설정이 없습니다." };
  const manifestPath = path.resolve(cwd, options.manifestPath ?? SOURCE_MANIFEST);
  if (!existsSync(manifestPath)) {
    return failWith(
      `${path.relative(cwd, manifestPath)}가 없습니다.`,
      "`npx expo prebuild --platform android --no-install`을 먼저 실행하세요.",
    );
  }

  const xml = readFileSync(manifestPath, "utf8");
  const declared = readActivities(xml, "activity-alias");
  const problems: Problem[] = [];

  for (const alias of options.aliases) {
    const found = declared.find((a) => a.name.endsWith(alias));
    if (!found) {
      problems.push({ message: `별칭 ${alias}가 없습니다.`, hint: "이 아이콘으로 바꾸면 런처에서 앱이 사라집니다." });
      continue;
    }
    if (!found.launcher) problems.push({ message: `별칭 ${alias}에 LAUNCHER intent-filter가 없습니다.` });
    const shouldEnable = alias === options.enabledByDefault;
    if (found.enabled !== shouldEnable) {
      problems.push({
        message: `별칭 ${alias}가 기본 ${found.enabled ? "켜짐" : "꺼짐"}입니다 (기대: ${shouldEnable ? "켜짐" : "꺼짐"}).`,
        hint: "기본으로 켜진 별칭은 정확히 하나여야 합니다. 0개면 런처에서 앱이 사라지고, 2개 이상이면 아이콘이 여럿 보입니다.",
      });
    }
  }
  const strayEnabled = declared.filter(
    (a) => a.enabled && a.launcher && !options.aliases.some((alias) => a.name.endsWith(alias)),
  );
  for (const a of strayEnabled) {
    problems.push({ message: `설정에 없는 별칭 ${a.name}가 켜진 런처로 선언돼 있습니다.`, hint: "아이콘이 하나 더 보입니다." });
  }

  const mainName = options.mainActivity ?? ".MainActivity";
  const main = readActivities(xml, "activity").find((a) => a.name.endsWith(mainName));
  if (!main) {
    problems.push({ message: `메인 액티비티(${mainName})를 찾지 못했습니다.`, hint: "`android.launcherAliases.mainActivity`로 지정하세요." });
  } else {
    if (main.launcher) {
      problems.push({ message: `메인 액티비티에 LAUNCHER intent-filter가 남아 있습니다.`, hint: "별칭과 합쳐 아이콘이 둘로 보입니다." });
    }
    if (!main.enabled) {
      problems.push({ message: `메인 액티비티가 꺼져 있습니다.`, hint: "딥링크·알림으로 앱을 여는 경로가 끊깁니다." });
    }
  }

  const total = options.aliases.length;
  return problems.length === 0
    ? { status: "pass", summary: `런처 별칭 ${String(total)}개, 기본 ${options.enabledByDefault} 확인` }
    : { status: "fail", summary: `런처 별칭 ${String(total)}개 중 문제 ${String(problems.length)}건`, problems };
}

interface Activity {
  readonly name: string;
  readonly enabled: boolean;
  readonly launcher: boolean;
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
    };
  });
}

function failWith(message: string, hint?: string): CheckResult {
  return { status: "fail", summary: message, problems: [hint === undefined ? { message } : { message, hint }] };
}
