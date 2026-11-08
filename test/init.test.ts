import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EXIT, main } from "../src/cli.js";
import { parseConfig } from "../src/config.js";
import { buildInitialConfig, TODO_REASON } from "../src/init.js";
import { runChecks, hasFailure } from "../src/run.js";
import { makeProject, plistXml } from "./helpers.js";

const MANIFEST = `<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
  <uses-permission android:name="android.permission.INTERNET"/>
  <uses-permission android:name="android.permission.CAMERA" tools:node="remove"/>
  <application>
    <activity android:name=".MainActivity"/>
    <activity-alias android:name=".MainActivityDefault" android:enabled="true">
      <intent-filter><category android:name="android.intent.category.LAUNCHER"/></intent-filter>
    </activity-alias>
    <activity-alias android:name=".MainActivitySunny" android:enabled="false">
      <intent-filter><category android:name="android.intent.category.LAUNCHER"/></intent-filter>
    </activity-alias>
  </application>
</manifest>`;

const MERGED = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.INTERNET"/>
  <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
  <uses-permission android:name="com.google.android.gms.permission.AD_ID"/>
</manifest>`;

function prebuiltProject(extra: Record<string, string> = {}) {
  return makeProject({
    "ios/App/Info.plist": plistXml({
      NSCalendarsUsageDescription: "캘린더 가져오기",
      NSRemindersUsageDescription: "필수",
      NSCameraUsageDescription: " ",
      CFBundleName: "App",
    }),
    "ios/App.xcodeproj/project.pbxproj": 'ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = "Sunny Rainy";',
    "ios/App/Images.xcassets/Sunny.appiconset/Contents.json": '{"images":[{"filename":"a.png"}]}',
    "ios/App/Images.xcassets/Sunny.appiconset/a.png": "png",
    "ios/App/Images.xcassets/Rainy.appiconset/Contents.json": '{"images":[{"filename":"a.png"}]}',
    "ios/App/Images.xcassets/Rainy.appiconset/a.png": "png",
    "android/app/src/main/AndroidManifest.xml": MANIFEST,
    ...extra,
  });
}

describe("buildInitialConfig", () => {
  it("지금 산출물을 기준선으로 적는다 — 빈 권한 문구는 빼고, 제거 지시자는 forbidden으로", () => {
    const draft = buildInitialConfig(prebuiltProject());
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const { ios, android } = draft.value.config;
    expect(ios?.infoPlist?.requiredKeys.map((k) => k.key)).toEqual([
      "NSCalendarsUsageDescription",
      "NSRemindersUsageDescription",
    ]);
    expect(ios?.alternateIcons?.names).toEqual(["Rainy", "Sunny"]);
    expect(android?.permissions?.required?.map((r) => r.name)).toEqual(["INTERNET"]);
    expect(android?.permissions?.forbidden).toEqual([{ name: "CAMERA", reason: TODO_REASON, blockedInSource: true }]);
    expect(android?.launcherAliases).toEqual({
      aliases: ["MainActivityDefault", "MainActivitySunny"],
      enabledByDefault: "MainActivityDefault",
    });
  });

  it("병합본이 있으면 라이브러리가 넣은 권한을 requiredMerged로 담는다", () => {
    const cwd = prebuiltProject({
      "android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml": MERGED,
    });
    const draft = buildInitialConfig(cwd);
    expect(draft.ok && draft.value.config.android?.permissions?.requiredMerged?.map((r) => r.name)).toEqual([
      "POST_NOTIFICATIONS",
      "com.google.android.gms.permission.AD_ID",
    ]);
  });

  it("만든 초안은 스키마를 통과하고, 같은 산출물에 돌리면 모든 검사가 통과한다", async () => {
    const cwd = prebuiltProject();
    const draft = buildInitialConfig(cwd);
    if (!draft.ok) throw new Error(draft.error);
    const parsed = parseConfig(JSON.parse(JSON.stringify(draft.value.config)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const run = await runChecks({ cwd, config: parsed.value });
    expect(run.ok && hasFailure(run.value)).toBe(false);
  });

  it("산출물이 없으면 prebuild를 먼저 하라고 알려 준다", () => {
    const draft = buildInitialConfig(makeProject({}));
    expect(draft.ok).toBe(false);
    expect(!draft.ok && draft.error).toContain("expo prebuild");
  });
});

async function run(argv: string[], cwd: string) {
  const out: string[] = [];
  const errOut: string[] = [];
  const code = await main(argv, { cwd, stdout: (s) => out.push(s), stderr: (s) => errOut.push(s) });
  return { code, stdout: out.join("\n"), stderr: errOut.join("\n") };
}

describe("cli init", () => {
  it("설정 파일을 만들고, 무엇을 찾았는지와 TODO를 채우라는 안내를 보여 준다", async () => {
    const cwd = prebuiltProject();
    const { code, stdout } = await run(["init"], cwd);
    expect(code).toBe(EXIT.ok);
    expect(stdout).toContain("release-guard.config.json를 만들었습니다");
    expect(stdout).toContain("iOS: 권한 문구 2개");
    const written = JSON.parse(readFileSync(path.join(cwd, "release-guard.config.json"), "utf8")) as unknown;
    expect(parseConfig(written).ok).toBe(true);
    // 만든 설정으로 바로 check가 통과한다
    expect((await run(["check"], cwd)).code).toBe(EXIT.ok);
  });

  it("이미 설정이 있으면 덮어쓰지 않는다 — --force로만", async () => {
    const cwd = prebuiltProject();
    writeFileSync(path.join(cwd, "release-guard.config.json"), "{}");
    const first = await run(["init"], cwd);
    expect(first.code).toBe(EXIT.usage);
    expect(first.stderr).toContain("--force");
    expect(readFileSync(path.join(cwd, "release-guard.config.json"), "utf8")).toBe("{}");
    expect((await run(["init", "--force"], cwd)).code).toBe(EXIT.ok);
    expect(readFileSync(path.join(cwd, "release-guard.config.json"), "utf8")).not.toBe("{}");
  });

  it("--stdout은 파일을 만들지 않고 JSON만 출력한다", async () => {
    const cwd = prebuiltProject();
    const { code, stdout } = await run(["init", "--stdout"], cwd);
    expect(code).toBe(EXIT.ok);
    expect(parseConfig(JSON.parse(stdout)).ok).toBe(true);
    expect(existsSync(path.join(cwd, "release-guard.config.json"))).toBe(false);
  });

  it("산출물이 없으면 사용법 오류(2)", async () => {
    expect((await run(["init"], makeProject({}))).code).toBe(EXIT.usage);
  });
});
