import { describe, expect, it } from "vitest";
import { readPermissions, runAndroidManifest } from "../src/checks/android-manifest.js";
import type { AndroidPermissionsConfig } from "../src/config.js";
import { makeProject } from "./helpers.js";

const SOURCE = "android/app/src/main/AndroidManifest.xml";
const MERGED = "android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml";

function manifest(...permissionTags: string[]): string {
  return `<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
${permissionTags.join("\n")}
  <application android:name=".MainApplication" />
</manifest>`;
}
const uses = (name: string, extra = "") => `  <uses-permission android:name="${name}" ${extra}/>`;

const rules: AndroidPermissionsConfig = {
  required: [{ name: "INTERNET", reason: "서버 통신" }],
  requiredMerged: [{ name: "POST_NOTIFICATIONS", reason: "expo-notifications가 넣는다. 없으면 Android 13+에서 푸시 권한 요청 불가" }],
  forbidden: [
    { name: "CAMERA", reason: "앨범 선택만 쓴다", blockedInSource: true },
    { name: "READ_CONTACTS", reason: "연락처를 읽는 기능이 없다" },
  ],
};

describe("android-manifest (소스)", () => {
  it("필수 권한이 있고, 막은 권한에 제거 지시자가 붙어 있으면 통과", () => {
    const cwd = makeProject({
      [SOURCE]: manifest(uses("android.permission.INTERNET"), uses("android.permission.CAMERA", 'tools:node="remove"')),
    });
    expect(runAndroidManifest(cwd, rules, "source")).toMatchObject({ status: "pass" });
  });

  it("blockedPermissions 설정이 빠져 제거 지시자 항목이 사라진 것을 잡는다 — '없음'은 안전 신호가 아니다", () => {
    const cwd = makeProject({ [SOURCE]: manifest(uses("android.permission.INTERNET")) });
    const result = runAndroidManifest(cwd, rules, "source");
    expect(result).toMatchObject({ status: "fail" });
    expect(JSON.stringify(result)).toContain("has no removal directive");
    expect(JSON.stringify(result)).toContain("blockedPermissions");
  });

  it("막은 권한이 제거 지시자 없이 선언되면 실패", () => {
    const cwd = makeProject({
      [SOURCE]: manifest(uses("android.permission.INTERNET"), uses("android.permission.CAMERA")),
    });
    expect(JSON.stringify(runAndroidManifest(cwd, rules, "source"))).toContain('without tools:node=\\"remove\\"');
  });

  it("금지 권한이 선언되면 이유와 함께 실패", () => {
    const cwd = makeProject({
      [SOURCE]: manifest(
        uses("android.permission.INTERNET"),
        uses("android.permission.CAMERA", 'tools:node="remove"'),
        uses("android.permission.READ_CONTACTS"),
      ),
    });
    expect(runAndroidManifest(cwd, rules, "source")).toEqual({
      status: "fail",
      summary: `${SOURCE}: 1 of 3 permission rule(s) violated`,
      problems: [{ message: "READ_CONTACTS is declared.", hint: "연락처를 읽는 기능이 없다" }],
    });
  });

  it("소스 모드는 병합 전용 필수 권한(requiredMerged)을 요구하지 않는다", () => {
    const cwd = makeProject({
      [SOURCE]: manifest(uses("android.permission.INTERNET"), uses("android.permission.CAMERA", 'tools:node="remove"')),
    });
    expect(JSON.stringify(runAndroidManifest(cwd, rules, "source"))).not.toContain("POST_NOTIFICATIONS");
  });

  it("prebuild 전이면 무엇을 해야 하는지 알려 준다", () => {
    expect(JSON.stringify(runAndroidManifest(makeProject({}), rules, "source"))).toContain("expo prebuild");
  });

  it("설정이 없거나 규칙이 비면 건너뛴다", () => {
    expect(runAndroidManifest(makeProject({}), undefined, "source").status).toBe("skip");
    expect(runAndroidManifest(makeProject({}), {}, "source").status).toBe("skip");
  });
});

describe("android-merged-manifest (병합본)", () => {
  it("라이브러리가 넣는 권한까지 있고 금지 권한이 없으면 통과", () => {
    const cwd = makeProject({
      [MERGED]: manifest(uses("android.permission.INTERNET"), uses("android.permission.POST_NOTIFICATIONS")),
    });
    expect(runAndroidManifest(cwd, rules, "merged")).toMatchObject({ status: "pass" });
  });

  it("라이브러리에서 되살아난 금지 권한을 잡는다", () => {
    const cwd = makeProject({
      [MERGED]: manifest(
        uses("android.permission.INTERNET"),
        uses("android.permission.POST_NOTIFICATIONS"),
        uses("android.permission.CAMERA"),
      ),
    });
    expect(JSON.stringify(runAndroidManifest(cwd, rules, "merged"))).toContain("CAMERA is still in the final manifest");
  });

  it("점이 들어간 전체 이름 권한도 검사한다 (예: 광고 ID)", () => {
    const cwd = makeProject({ [MERGED]: manifest(uses("android.permission.INTERNET")) });
    const result = runAndroidManifest(
      cwd,
      { requiredMerged: [{ name: "com.google.android.gms.permission.AD_ID", reason: "설치 광고 측정" }] },
      "merged",
    );
    expect(JSON.stringify(result)).toContain("com.google.android.gms.permission.AD_ID is missing");
  });

  it("Gradle 단계 전이면 무엇을 해야 하는지 알려 준다", () => {
    expect(JSON.stringify(runAndroidManifest(makeProject({}), rules, "merged"))).toContain("processReleaseMainManifest");
  });

  it("병합본 후보가 여럿이면 추측하지 않고 mergedPath를 요구한다", () => {
    const cwd = makeProject({
      [MERGED]: manifest(),
      "android/app/build/intermediates/merged_manifests/release/AndroidManifest.xml": manifest(),
    });
    expect(JSON.stringify(runAndroidManifest(cwd, rules, "merged"))).toContain("mergedPath");
  });

  it("mergedPath를 지정하면 그 파일을 본다", () => {
    const cwd = makeProject({
      "custom/AndroidManifest.xml": manifest(uses("android.permission.INTERNET"), uses("android.permission.POST_NOTIFICATIONS")),
    });
    expect(runAndroidManifest(cwd, { ...rules, mergedPath: "custom/AndroidManifest.xml" }, "merged")).toMatchObject({
      status: "pass",
    });
  });
});

describe("readPermissions", () => {
  it("uses-permission-sdk-23은 다른 태그로 보고 섞지 않는다", () => {
    const found = readPermissions(
      manifest(uses("android.permission.INTERNET"), '  <uses-permission-sdk-23 android:name="android.permission.CAMERA"/>'),
    );
    expect([...found.keys()]).toEqual(["android.permission.INTERNET"]);
  });

  it("여러 줄에 걸친 태그도 읽는다", () => {
    const found = readPermissions('<uses-permission\n    android:name="android.permission.VIBRATE"\n    tools:node="remove" />');
    expect(found.get("android.permission.VIBRATE")).toContain('tools:node="remove"');
  });
});
