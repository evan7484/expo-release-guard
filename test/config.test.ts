import { describe, expect, it } from "vitest";
import { loadConfig, parseConfig } from "../src/config.js";
import { makeProject } from "./helpers.js";

describe("parseConfig", () => {
  it("빈 설정은 허용한다", () => {
    expect(parseConfig({})).toEqual({ ok: true, value: {} });
  });

  it.each([
    [null, "The config must be an object."],
    [{ ios: [] }, "`ios` must be an object."],
    [{ ios: { infoPlist: { requiredKeys: "x" } } }, "`ios.infoPlist.requiredKeys` must be an array."],
    [{ ios: { infoPlist: { path: 1, requiredKeys: [] } } }, "`ios.infoPlist.path` must be a string."],
    [{ ios: { infoPlist: { requiredKeys: [{ key: "A" }] } } }, "`ios.infoPlist.requiredKeys[0]` must be { key: string, reason: string }."],
    [{ ios: { infoPlist: { requiredKeys: [{ key: " ", reason: "r" }] } } }, "`ios.infoPlist.requiredKeys[0].key` is empty."],
  ])("잘못된 모양은 위치를 짚어 거부한다 %#", (raw, message) => {
    expect(parseConfig(raw)).toEqual({ ok: false, error: message });
  });

  it("중복 키를 거부한다", () => {
    const raw = { ios: { infoPlist: { requiredKeys: [{ key: "A", reason: "1" }, { key: "A", reason: "2" }] } } };
    expect(parseConfig(raw)).toEqual({ ok: false, error: "`ios.infoPlist.requiredKeys` lists A more than once." });
  });

  it("path가 없을 때 path 속성을 만들지 않는다 (exactOptionalPropertyTypes)", () => {
    const parsed = parseConfig({ ios: { infoPlist: { requiredKeys: [] } } });
    expect(parsed.ok && parsed.value.ios?.infoPlist && "path" in parsed.value.ios.infoPlist).toBe(false);
  });
});

describe("loadConfig", () => {
  it("JSON 설정을 찾는다", async () => {
    const cwd = makeProject({ "release-guard.config.json": JSON.stringify({ ios: {} }) });
    const loaded = await loadConfig(cwd);
    expect(loaded.ok && loaded.value.config).toEqual({ ios: {} });
  });

  it("JS 설정의 default export를 읽는다", async () => {
    const cwd = makeProject({ "release-guard.config.mjs": "export default { ios: {} };" });
    const loaded = await loadConfig(cwd);
    expect(loaded.ok && loaded.value.config).toEqual({ ios: {} });
  });

  it("설정이 없으면 만들 파일 이름을 알려 준다", async () => {
    const loaded = await loadConfig(makeProject({}));
    expect(loaded.ok ? "" : loaded.error).toContain("release-guard.config.json");
  });

  it("JSON 문법 오류를 파일 이름과 함께 알려 준다", async () => {
    const loaded = await loadConfig(makeProject({ "release-guard.config.json": "{" }));
    expect(loaded.ok ? "" : loaded.error).toContain("release-guard.config.json");
  });
});

describe("parseConfig — android.permissions", () => {
  it("규칙을 그대로 받아들인다", () => {
    const parsed = parseConfig({
      android: {
        permissions: {
          required: [{ name: "INTERNET", reason: "서버 통신" }],
          forbidden: [{ name: "CAMERA", reason: "앨범만", blockedInSource: true }],
        },
      },
    });
    expect(parsed).toEqual({
      ok: true,
      value: {
        android: {
          permissions: {
            required: [{ name: "INTERNET", reason: "서버 통신" }],
            requiredMerged: [],
            forbidden: [{ name: "CAMERA", reason: "앨범만", blockedInSource: true }],
          },
        },
      },
    });
  });

  it.each([
    [{ android: [] }, "`android` must be an object."],
    [{ android: { permissions: { required: "INTERNET" } } }, "`android.permissions.required` must be an array."],
    [{ android: { permissions: { required: [{ name: "INTERNET" }] } } }, "`android.permissions.required[0]` must be { name: string, reason: string }."],
    [{ android: { permissions: { required: [{ name: "A", reason: "r", blockedInSource: true }] } } }, "`android.permissions.required[0]`.blockedInSource is only allowed in forbidden."],
    [{ android: { permissions: { mergedPath: 3 } } }, "`android.permissions.mergedPath` must be a string."],
  ])("잘못된 모양은 위치를 짚어 거부한다 %#", (raw, message) => {
    expect(parseConfig(raw)).toEqual({ ok: false, error: message });
  });

  it("짧은 이름과 전체 이름을 같은 권한으로 보고 중복을 거부한다", () => {
    const parsed = parseConfig({
      android: { permissions: { forbidden: [{ name: "CAMERA", reason: "1" }, { name: "android.permission.CAMERA", reason: "2" }] } },
    });
    expect(parsed).toEqual({ ok: false, error: "`android.permissions.forbidden` lists android.permission.CAMERA more than once." });
  });

  it("같은 권한을 required와 forbidden에 함께 두면 거부한다", () => {
    const parsed = parseConfig({
      android: { permissions: { required: [{ name: "CAMERA", reason: "1" }], forbidden: [{ name: "CAMERA", reason: "2" }] } },
    });
    expect(parsed).toEqual({ ok: false, error: "`android.permissions`: CAMERA is both required and forbidden." });
  });
});

describe("parseConfig — ios.infoPlist.forbidden · mainActivityActions", () => {
  it("requiredKeys 없이 forbidden만 둘 수 있다", () => {
    const parsed = parseConfig({ ios: { infoPlist: { forbidden: [{ key: "UIBackgroundModes", values: ["processing"], reason: "r" }] } } });
    expect(parsed).toEqual({
      ok: true,
      value: { ios: { infoPlist: { requiredKeys: [], forbidden: [{ key: "UIBackgroundModes", values: ["processing"], reason: "r" }] } } },
    });
  });

  it("같은 키를 required와 (values 없는) forbidden에 함께 두면 거부한다", () => {
    const parsed = parseConfig({
      ios: { infoPlist: { requiredKeys: [{ key: "A", reason: "r" }], forbidden: [{ key: "A", reason: "r" }] } },
    });
    expect(parsed).toEqual({ ok: false, error: "`ios.infoPlist`: A is both required and forbidden." });
  });

  it("mainActivityActions는 비어 있지 않은 문자열 배열", () => {
    const base = { aliases: ["X"], enabledByDefault: "X" };
    expect(parseConfig({ android: { launcherAliases: { ...base, mainActivityActions: [] } } }).ok).toBe(false);
    const parsed = parseConfig({ android: { launcherAliases: { ...base, mainActivityActions: ["android.intent.action.VIEW"] } } });
    expect(parsed.ok && parsed.value.android?.launcherAliases?.mainActivityActions).toEqual(["android.intent.action.VIEW"]);
  });
});

