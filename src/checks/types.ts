import type { Config } from "../config.js";
import type { CheckResult } from "../types.js";

export interface CheckContext {
  /** 검사 대상 Expo 프로젝트 루트 */
  readonly cwd: string;
  readonly config: Config;
}

export interface Check {
  readonly id: string;
  /** 한 줄 설명 — `list` 명령과 리포트에 쓴다 */
  readonly title: string;
  run(ctx: CheckContext): Promise<CheckResult>;
}
