import { describe, expect, it } from "vitest";
import {
  readActivities,
  readAlternateIconNames,
  runAndroidLauncherAliases,
  runIosAlternateIcons,
} from "../src/checks/app-icons.js";
import { parseConfig } from "../src/config.js";
import { makeProject, plistXml } from "./helpers.js";

const iconSet = (file = "icon.png") => JSON.stringify({ images: [{ filename: file, idiom: "universal" }] });

/** Debug·Release 두 빌드 구성에 같은 설정이 들어간 pbxproj 조각 */
const pbxproj = (debug: string, release = debug) => `
  buildSettings = {
    ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = ${debug};
    PRODUCT_NAME = App;
  };
  buildSettings = {
    ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = ${release};
  };`;

function iosProject(overrides: Record<string, string> = {}) {
  return makeProject({
    "ios/App/Info.plist": plistXml({}),
    "ios/App.xcodeproj/project.pbxproj": pbxproj('"Sunny Rainy"'),
    "ios/App/Images.xcassets/Sunny.appiconset/Contents.json": iconSet(),
    "ios/App/Images.xcassets/Sunny.appiconset/icon.png": "png",
    "ios/App/Images.xcassets/Rainy.appiconset/Contents.json": iconSet(),
    "ios/App/Images.xcassets/Rainy.appiconset/icon.png": "png",
    ...overrides,
  });
}

const iosOptions = { names: ["Sunny", "Rainy"] };

describe("ios-alternate-icons", () => {
  it("빌드 설정과 에셋 카탈로그에 모두 등록돼 있으면 통과", () => {
    const result = runIosAlternateIcons(iosProject(), iosOptions);
    expect(result).toMatchObject({ status: "pass", summary: "all 2 alternate icon(s) registered" });
  });

  it("config plugin이 빠져 빌드 설정이 없으면 실패 — 빌드는 통과하고 아이콘 변경만 실패하는 경우", () => {
    const cwd = iosProject({ "ios/App.xcodeproj/project.pbxproj": "buildSettings = { PRODUCT_NAME = App; };" });
    const result = runIosAlternateIcons(cwd, iosOptions);
    expect(result.status).toBe("fail");
    expect(JSON.stringify(result)).toContain("ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES is missing");
  });

  it("한 빌드 구성에서만 이름이 빠져도 잡는다", () => {
    const cwd = iosProject({ "ios/App.xcodeproj/project.pbxproj": pbxproj('"Sunny Rainy"', "Sunny") });
    const result = runIosAlternateIcons(cwd, iosOptions);
    expect(result.status).toBe("fail");
    expect(JSON.stringify(result)).toContain("missing: Rainy");
  });

  it("appiconset이 없거나, Contents.json이 가리키는 이미지가 없으면 실패", () => {
    const cwd = makeProject({
      "ios/App/Info.plist": plistXml({}),
      "ios/App.xcodeproj/project.pbxproj": pbxproj('"Sunny Rainy"'),
      "ios/App/Images.xcassets/Sunny.appiconset/Contents.json": iconSet("missing.png"),
    });
    const result = runIosAlternateIcons(cwd, iosOptions);
    const text = JSON.stringify(result);
    expect(text).toContain("Sunny.appiconset has no actual image file");
    expect(text).toContain("Rainy.appiconset does not exist");
  });

  it("설정이 없으면 건너뛰고, prebuild 전이면 다음 할 일을 알려 준다", () => {
    expect(runIosAlternateIcons(makeProject({}), undefined).status).toBe("skip");
    expect(JSON.stringify(runIosAlternateIcons(makeProject({}), iosOptions))).toContain("expo prebuild");
  });
});

describe("readAlternateIconNames", () => {
  it("따옴표 문자열·단일 값·괄호 배열을 모두 읽는다", () => {
    const text = `
      ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = "A B";
      ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = A;
      ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = (
        A,
        "B",
      );`;
    expect(readAlternateIconNames(text)).toEqual([["A", "B"], ["A"], ["A", "B"]]);
  });
});

const alias = (name: string, enabled: boolean, launcher = true) => `
    <activity-alias android:name=".${name}" android:enabled="${String(enabled)}" android:targetActivity=".MainActivity">
      ${launcher ? '<intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter>' : ""}
    </activity-alias>`;

const manifest = (body: string, mainFilters = '<intent-filter><action android:name="android.intent.action.VIEW"/></intent-filter>') => `
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application>
    <activity android:name=".MainActivity" android:exported="true">
      ${mainFilters}
    </activity>${body}
  </application>
</manifest>`;

const androidOptions = { aliases: ["MainActivityDefault", "MainActivitySunny"], enabledByDefault: "MainActivityDefault" };
const androidProject = (xml: string) => makeProject({ "android/app/src/main/AndroidManifest.xml": xml });

describe("android-launcher-aliases", () => {
  it("별칭이 모두 LAUNCHER이고 기본 하나만 켜져 있으면 통과", () => {
    const cwd = androidProject(manifest(alias("MainActivityDefault", true) + alias("MainActivitySunny", false)));
    expect(runAndroidLauncherAliases(cwd, androidOptions)).toMatchObject({ status: "pass" });
  });

  it("별칭이 빠지면 실패 — 그 아이콘으로 바꾸면 런처에서 앱이 사라진다", () => {
    const cwd = androidProject(manifest(alias("MainActivityDefault", true)));
    const text = JSON.stringify(runAndroidLauncherAliases(cwd, androidOptions));
    expect(text).toContain("Alias MainActivitySunny is missing");
  });

  it("켜진 별칭이 둘이면 실패 — 아이콘이 둘로 보인다", () => {
    const cwd = androidProject(manifest(alias("MainActivityDefault", true) + alias("MainActivitySunny", true)));
    const text = JSON.stringify(runAndroidLauncherAliases(cwd, androidOptions));
    expect(text).toContain("MainActivitySunny is enabled by default");
  });

  it("메인 액티비티에 LAUNCHER가 남았거나 꺼져 있으면 실패", () => {
    const launcherMain = manifest(
      alias("MainActivityDefault", true) + alias("MainActivitySunny", false),
      '<intent-filter><category android:name="android.intent.category.LAUNCHER"/></intent-filter>',
    );
    expect(JSON.stringify(runAndroidLauncherAliases(androidProject(launcherMain), androidOptions))).toContain(
      "still has a LAUNCHER intent-filter",
    );
    const disabledMain = manifest(alias("MainActivityDefault", true) + alias("MainActivitySunny", false)).replace(
      'android:exported="true"',
      'android:enabled="false"',
    );
    expect(JSON.stringify(runAndroidLauncherAliases(androidProject(disabledMain), androidOptions))).toContain(
      "The main activity is disabled",
    );
  });

  it("메인 액티비티가 지켜야 할 action(딥링크 VIEW)을 잃으면 실패", () => {
    const body = alias("MainActivityDefault", true) + alias("MainActivitySunny", false);
    const options = { ...androidOptions, mainActivityActions: ["android.intent.action.VIEW"] };
    // 기본 manifest()의 메인 액티비티는 VIEW를 갖고 있다.
    expect(runAndroidLauncherAliases(androidProject(manifest(body)), options)).toMatchObject({ status: "pass" });
    const lost = manifest(body, '<intent-filter><action android:name="android.intent.action.SEND"/></intent-filter>');
    expect(JSON.stringify(runAndroidLauncherAliases(androidProject(lost), options))).toContain(
      "The main activity lost its android.intent.action.VIEW intent-filter",
    );
  });

  it("설정에 없는 켜진 런처 별칭도 잡는다", () => {
    const cwd = androidProject(
      manifest(alias("MainActivityDefault", true) + alias("MainActivitySunny", false) + alias("LegacyIcon", true)),
    );
    expect(JSON.stringify(runAndroidLauncherAliases(cwd, androidOptions))).toContain("Alias .LegacyIcon is not in the config");
  });
});

describe("readActivities", () => {
  it("activity와 activity-alias를 섞지 않고, enabled 생략은 켜짐으로 본다", () => {
    const xml = manifest(alias("MainActivityDefault", false) + '<activity-alias android:name=".Bare"/>');
    expect(readActivities(xml, "activity").map((a) => a.name)).toEqual([".MainActivity"]);
    expect(readActivities(xml, "activity-alias")).toEqual([
      { name: ".MainActivityDefault", enabled: false, launcher: true, actions: ["android.intent.action.MAIN"] },
      { name: ".Bare", enabled: true, launcher: false, actions: [] },
    ]);
  });
});

describe("parseConfig — 아이콘 설정", () => {
  it("enabledByDefault는 aliases 중 하나여야 한다", () => {
    const result = parseConfig({ android: { launcherAliases: { aliases: ["A"], enabledByDefault: "B" } } });
    expect(result).toEqual({ ok: false, error: "`android.launcherAliases.enabledByDefault` must be one of aliases." });
  });

  it("빈 이름 목록·중복 이름을 거부한다", () => {
    expect(parseConfig({ ios: { alternateIcons: { names: [] } } }).ok).toBe(false);
    expect(parseConfig({ ios: { alternateIcons: { names: ["A", "A"] } } })).toEqual({
      ok: false,
      error: "`ios.alternateIcons.names` lists A more than once.",
    });
  });

  it("다른 ios·android 설정과 함께 받아들인다", () => {
    const result = parseConfig({
      ios: { alternateIcons: { names: ["A"] }, infoPlist: { requiredKeys: [] } },
      android: { launcherAliases: { aliases: ["X"], enabledByDefault: "X" }, permissions: {} },
    });
    expect(result.ok && result.value.ios?.alternateIcons?.names).toEqual(["A"]);
    expect(result.ok && result.value.android?.launcherAliases?.enabledByDefault).toBe("X");
  });
});
