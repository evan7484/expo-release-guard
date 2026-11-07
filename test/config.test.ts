import { describe, expect, it } from "vitest";
import { loadConfig, parseConfig } from "../src/config.js";
import { makeProject } from "./helpers.js";

describe("parseConfig", () => {
  it("빈 설정은 허용한다", () => {
    expect(parseConfig({})).toEqual({ ok: true, value: {} });
  });

  it.each([
    [null, "설정은 객체여야 합니다."],
    [{ ios: [] }, "`ios`는 객체여야 합니다."],
    [{ ios: { infoPlist: { requiredKeys: "x" } } }, "`ios.infoPlist.requiredKeys`는 배열이어야 합니다."],
    [{ ios: { infoPlist: { path: 1, requiredKeys: [] } } }, "`ios.infoPlist.path`는 문자열이어야 합니다."],
    [{ ios: { infoPlist: { requiredKeys: [{ key: "A" }] } } }, "`ios.infoPlist.requiredKeys[0]`는 { key: string, reason: string } 이어야 합니다."],
    [{ ios: { infoPlist: { requiredKeys: [{ key: " ", reason: "r" }] } } }, "`ios.infoPlist.requiredKeys[0].key`가 비었습니다."],
  ])("잘못된 모양은 위치를 짚어 거부한다 %#", (raw, message) => {
    expect(parseConfig(raw)).toEqual({ ok: false, error: message });
  });

  it("중복 키를 거부한다", () => {
    const raw = { ios: { infoPlist: { requiredKeys: [{ key: "A", reason: "1" }, { key: "A", reason: "2" }] } } };
    expect(parseConfig(raw)).toEqual({ ok: false, error: "`ios.infoPlist.requiredKeys`에 A가 중복됩니다." });
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
