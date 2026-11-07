import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { IosInfoPlistConfig } from "../config.js";
import { parsePlist } from "../plist.js";
import { err, ok, type CheckResult, type Problem, type Result } from "../types.js";
import type { Check } from "./types.js";

/**
 * prebuild 산출물의 Info.plist에 필수 권한 키가 남아 있는지 본다.
 *
 * app.json(입력)이 멀쩡해도 config plugin이 prebuild 중 키를 지울 수 있다.
 * 일부 네이티브 모듈은 앱 시작 시 권한 키를 조회하므로, 키가 빠지면 빌드·테스트·업로드가
 * 모두 통과한 빌드가 스플래시에서 종료된다. 그래서 입력이 아니라 산출물을 검사한다.
 */
export const iosPlistCheck: Check = {
  id: "ios-plist",
  title: "prebuild 산출물 Info.plist의 필수 키",
  run({ cwd, config }) {
    return Promise.resolve(runIosPlist(cwd, config.ios?.infoPlist));
  },
};

export function runIosPlist(cwd: string, options: IosInfoPlistConfig | undefined): CheckResult {
  if (!options) return { status: "skip", reason: "`ios.infoPlist` 설정이 없습니다." };
  if (options.requiredKeys.length === 0) return { status: "skip", reason: "`ios.infoPlist.requiredKeys`가 비었습니다." };

  const located = options.path === undefined ? findInfoPlist(cwd) : ok(path.resolve(cwd, options.path));
  if (!located.ok) return failWith(located.error);
  const plistPath = located.value;
  if (!existsSync(plistPath)) {
    return failWith(`${path.relative(cwd, plistPath)}가 없습니다.`, "`npx expo prebuild --platform ios`를 먼저 실행하세요.");
  }

  let info: unknown;
  try {
    info = parsePlist(readFileSync(plistPath, "utf8"));
  } catch (e) {
    return failWith(`Info.plist를 해석하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (typeof info !== "object" || info === null || Array.isArray(info)) {
    return failWith("Info.plist 최상위가 dict가 아닙니다.");
  }
  const dict = info as Readonly<Record<string, unknown>>;

  const problems: Problem[] = options.requiredKeys
    .filter(({ key }) => {
      const value = dict[key];
      return typeof value !== "string" || value.trim() === "";
    })
    .map(({ key, reason }) => ({ message: `${key}가 없거나 비었습니다.`, hint: reason }));

  const total = options.requiredKeys.length;
  return problems.length === 0
    ? { status: "pass", summary: `필수 키 ${String(total)}개 모두 존재` }
    : { status: "fail", summary: `필수 키 ${String(total)}개 중 ${String(problems.length)}개 누락`, problems };
}

function failWith(message: string, hint?: string): CheckResult {
  return { status: "fail", summary: message, problems: [hint === undefined ? { message } : { message, hint }] };
}

/** 생성되는 Xcode 프로젝트 외의 디렉터리 — 앱 타깃을 찾을 때 건너뛴다 */
const NOT_APP_TARGET = new Set(["Pods", "build", "DerivedData"]);

/** `ios/<앱 이름>/Info.plist`를 찾는다. 후보가 여럿이면 추측하지 않고 경로 설정을 요구한다. */
export function findInfoPlist(cwd: string): Result<string> {
  const iosDir = path.join(cwd, "ios");
  if (!existsSync(iosDir)) {
    return err("ios/ 디렉터리가 없습니다. `npx expo prebuild --platform ios`를 먼저 실행하세요.");
  }
  const candidates = readdirSync(iosDir)
    .filter((name) => !NOT_APP_TARGET.has(name) && !name.includes(".") && !name.endsWith("Tests"))
    .map((name) => path.join(iosDir, name, "Info.plist"))
    .filter((p) => existsSync(p) && statSync(p).isFile());

  const [only, ...rest] = candidates;
  if (only === undefined) return err("ios/<앱 이름>/Info.plist를 찾지 못했습니다.");
  if (rest.length > 0) {
    const list = candidates.map((c) => path.relative(cwd, c)).join(", ");
    return err(`Info.plist 후보가 여럿입니다 (${list}). \`ios.infoPlist.path\`로 지정하세요.`);
  }
  return ok(only);
}
