import { checks as registry, type Check } from "./checks/index.js";
import type { Config } from "./config.js";
import { err, ok, type CheckResult, type Result } from "./types.js";

export interface CheckReport {
  readonly id: string;
  readonly title: string;
  readonly result: CheckResult;
}

export interface RunOptions {
  readonly cwd: string;
  readonly config: Config;
  /** 돌릴 검사 id. 생략하면 전부 */
  readonly only?: readonly string[];
}

/** 검사를 차례로 돌린다. 한 검사가 throw해도 나머지는 계속 돌고, 그 검사는 fail로 기록한다. */
export async function runChecks({ cwd, config, only }: RunOptions): Promise<Result<CheckReport[]>> {
  const selected = selectChecks(only);
  if (!selected.ok) return selected;

  const reports: CheckReport[] = [];
  for (const check of selected.value) {
    let result: CheckResult;
    try {
      result = await check.run({ cwd, config });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      result = { status: "fail", summary: "검사 도중 예외가 발생했습니다.", problems: [{ message }] };
    }
    reports.push({ id: check.id, title: check.title, result });
  }
  return ok(reports);
}

function selectChecks(only: readonly string[] | undefined): Result<readonly Check[]> {
  if (!only || only.length === 0) return ok(registry);
  const unknown = only.filter((id) => !registry.some((c) => c.id === id));
  if (unknown.length > 0) {
    return err(`알 수 없는 검사: ${unknown.join(", ")} (가능: ${registry.map((c) => c.id).join(", ")})`);
  }
  return ok(registry.filter((c) => only.includes(c.id)));
}

export const hasFailure = (reports: readonly CheckReport[]): boolean =>
  reports.some((r) => r.result.status === "fail");
