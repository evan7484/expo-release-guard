import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXIT, main } from "../src/cli.js";
import { makeProject, plistXml } from "./helpers.js";

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "expo-app");

async function run(argv: string[], cwd = fixture) {
  const out: string[] = [];
  const errOut: string[] = [];
  const code = await main(argv, { cwd, stdout: (s) => out.push(s), stderr: (s) => errOut.push(s) });
  return { code, stdout: out.join("\n"), stderr: errOut.join("\n") };
}

describe("cli", () => {
  it("통과하면 0으로 끝난다", async () => {
    const { code, stdout } = await run(["check"]);
    expect(code).toBe(EXIT.ok);
    expect(stdout).toContain("✔ ios-plist: 필수 키 3개 모두 존재");
    expect(stdout).toContain("✔ android-manifest:");
    // Gradle 단계가 필요한 병합 검사는 id를 지정해야만 돈다
    expect(stdout).not.toContain("android-merged-manifest");
  });

  it("검사가 실패하면 1로 끝나고 이유를 출력한다", async () => {
    const cwd = makeProject({
      "ios/App/Info.plist": plistXml({}),
      "release-guard.config.json": JSON.stringify({
        ios: { infoPlist: { requiredKeys: [{ key: "NSRemindersUsageDescription", reason: "시작 시 조회" }] } },
      }),
    });
    const { code, stdout } = await run(["check"], cwd);
    expect(code).toBe(EXIT.checkFailed);
    expect(stdout).toContain("NSRemindersUsageDescription");
    expect(stdout).toContain("시작 시 조회");
  });

  it("--json은 기계가 읽을 수 있는 결과를 낸다", async () => {
    const { stdout } = await run(["check", "--json"]);
    expect(JSON.parse(stdout)).toMatchObject({
      ok: true,
      checks: [
        { id: "ios-plist", result: { status: "pass" } },
        { id: "android-manifest", result: { status: "pass" } },
      ],
    });
  });

  it("알 수 없는 검사 id·명령·옵션은 사용법 오류(2)", async () => {
    expect((await run(["check", "nope"])).code).toBe(EXIT.usage);
    expect((await run(["deploy"])).code).toBe(EXIT.usage);
    expect((await run(["check", "--wat"])).code).toBe(EXIT.usage);
    expect((await run([])).code).toBe(EXIT.usage);
  });

  it("설정 파일이 없으면 사용법 오류(2)", async () => {
    const { code, stderr } = await run(["check"], makeProject({}));
    expect(code).toBe(EXIT.usage);
    expect(stderr).toContain("설정 파일이 없습니다");
  });

  it("--cwd로 다른 프로젝트를 검사한다", async () => {
    expect((await run(["check", "--cwd", fixture], "/")).code).toBe(EXIT.ok);
  });

  it("list는 등록된 검사를 보여 준다", async () => {
    const { stdout } = await run(["list"]);
    expect(stdout).toMatch(/^ios-plist\t/);
    expect(stdout).toContain("android-merged-manifest\tGradle 병합 매니페스트(최종본)의 권한 (id 지정 시에만)");
  });

  it("병합 검사는 id로 실행하고, Gradle 단계 전이면 실패로 알려 준다", async () => {
    const { code, stdout } = await run(["check", "android-merged-manifest"]);
    expect(code).toBe(EXIT.checkFailed);
    expect(stdout).toContain("processReleaseMainManifest");
  });
});
