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
      summary: "필수 키 2개 모두 존재",
    });
  });

  it("config plugin이 키를 지운 산출물을 잡고, 이유를 hint로 보여 준다", () => {
    const cwd = makeProject({ "ios/App/Info.plist": plistXml({ NSCalendarsUsageDescription: "a" }) });
    const result = runIosPlist(cwd, { requiredKeys: required });
    expect(result).toEqual({
      status: "fail",
      summary: "필수 키 2개 중 1개 누락",
      problems: [{ message: "NSRemindersUsageDescription가 없거나 비었습니다.", hint: required[1].reason }],
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
    expect(result).toMatchObject({ status: "fail", summary: "ios/Nope/Info.plist가 없습니다." });
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
