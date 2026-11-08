import { describe, expect, it } from "vitest";
import { findInfoPlist, runIosPlist } from "../src/checks/ios-plist.js";
import { makeProject, plistXml } from "./helpers.js";

const required = [
  { key: "NSCalendarsUsageDescription", reason: "캘린더 가져오기" },
  { key: "NSRemindersUsageDescription", reason: "expo-calendar가 시작 시 조회 — 없으면 스플래시에서 종료" },
] as const;

describe("ios-plist", () => {
  it("필수 키가 모두 있으면 통과한다", () => {
    const cwd = makeProject({
      "ios/App/Info.plist": plistXml({ NSCalendarsUsageDescription: "a", NSRemindersUsageDescription: "b" }),
    });
    expect(runIosPlist(cwd, { requiredKeys: required })).toEqual({
      status: "pass",
      summary: "all 2 Info.plist rule(s) satisfied",
    });
  });

  it("config plugin이 키를 지운 산출물을 잡고, 이유를 hint로 보여 준다", () => {
    const cwd = makeProject({ "ios/App/Info.plist": plistXml({ NSCalendarsUsageDescription: "a" }) });
    const result = runIosPlist(cwd, { requiredKeys: required });
    expect(result).toEqual({
      status: "fail",
      summary: "1 of 2 Info.plist rule(s) violated",
      problems: [{ message: "NSRemindersUsageDescription is missing or empty.", hint: required[1].reason }],
    });
  });

  it("공백뿐인 값도 누락으로 본다", () => {
    const cwd = makeProject({
      "ios/App/Info.plist": plistXml({ NSCalendarsUsageDescription: "  ", NSRemindersUsageDescription: "b" }),
    });
    expect(runIosPlist(cwd, { requiredKeys: required }).status).toBe("fail");
  });

  it("설정이 없으면 실패가 아니라 건너뛴다", () => {
    expect(runIosPlist(makeProject({}), undefined).status).toBe("skip");
    expect(runIosPlist(makeProject({}), { requiredKeys: [] }).status).toBe("skip");
  });

  it("prebuild 전이면 무엇을 해야 하는지 알려 준다", () => {
    const result = runIosPlist(makeProject({}), { requiredKeys: required });
    expect(result.status).toBe("fail");
    expect(JSON.stringify(result)).toContain("expo prebuild");
  });

  it("지정한 path가 없으면 실패한다", () => {
    const result = runIosPlist(makeProject({}), { path: "ios/Nope/Info.plist", requiredKeys: required });
    expect(result).toMatchObject({ status: "fail", summary: "ios/Nope/Info.plist does not exist." });
  });

  it("plist가 깨져 있으면 해석 실패로 보고한다", () => {
    const cwd = makeProject({ "ios/App/Info.plist": "<plist><dict><key>x</key>" });
    expect(runIosPlist(cwd, { requiredKeys: required })).toMatchObject({ status: "fail" });
  });
});

describe("findInfoPlist", () => {
  it("Pods·테스트 타깃은 빼고 앱 타깃 하나를 찾는다", () => {
    const cwd = makeProject({
      "ios/App/Info.plist": plistXml({}),
      "ios/Pods/Info.plist": plistXml({}),
      "ios/AppTests/Info.plist": plistXml({}),
      "ios/App.xcodeproj/Info.plist": plistXml({}),
    });
    const found = findInfoPlist(cwd);
    expect(found.ok && found.value.endsWith("ios/App/Info.plist")).toBe(true);
  });

  it("후보가 여럿이면 추측하지 않고 path 설정을 요구한다", () => {
    const cwd = makeProject({ "ios/A/Info.plist": plistXml({}), "ios/B/Info.plist": plistXml({}) });
    const found = findInfoPlist(cwd);
    expect(found).toMatchObject({ ok: false });
    expect(found.ok ? "" : found.error).toContain("ios.infoPlist.path");
  });
});

describe("ios-plist — forbidden", () => {
  const plistWithModes = (modes: string[]) =>
    plistXml({ NSCalendarsUsageDescription: "a" }).replace(
      "</dict>",
      `  <key>UIBackgroundModes</key>\n  <array>${modes.map((m) => `<string>${m}</string>`).join("")}</array>\n</dict>`,
    );

  it("금지 값을 담은 배열 키를 잡는다 — 다른 플랫폼 플러그인이 끌어온 백그라운드 모드", () => {
    const cwd = makeProject({ "ios/App/Info.plist": plistWithModes(["remote-notification", "processing"]) });
    const result = runIosPlist(cwd, {
      requiredKeys: [],
      forbidden: [{ key: "UIBackgroundModes", values: ["processing", "location"], reason: "Android-only task" }],
    });
    expect(result).toEqual({
      status: "fail",
      summary: "1 of 1 Info.plist rule(s) violated",
      problems: [{ message: "UIBackgroundModes contains processing.", hint: "Android-only task" }],
    });
  });

  it("금지 값이 없으면 통과, values 없이 적은 키는 있기만 해도 실패", () => {
    const cwd = makeProject({ "ios/App/Info.plist": plistWithModes(["remote-notification"]) });
    expect(
      runIosPlist(cwd, { requiredKeys: [], forbidden: [{ key: "UIBackgroundModes", values: ["processing"], reason: "r" }] }).status,
    ).toBe("pass");
    expect(
      JSON.stringify(runIosPlist(cwd, { requiredKeys: [], forbidden: [{ key: "UIBackgroundModes", reason: "r" }] })),
    ).toContain("UIBackgroundModes must not be present.");
  });
});
