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
  /**
   * 검사 id 없이 `check`를 실행할 때 포함할지. 기본 true.
   * 별도 빌드 단계(예: Gradle 병합)가 있어야 하는 검사는 false로 두고 id로만 실행한다.
   */
  readonly runsByDefault?: boolean;
  run(ctx: CheckContext): Promise<CheckResult>;
}
