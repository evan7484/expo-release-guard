import type { CheckReport } from "./run.js";

const ICON = { pass: "✔", fail: "✖", skip: "–" } as const;

/** 사람이 읽는 리포트. CI 로그에서 바로 원인과 이유가 보이게 hint를 들여 쓴다. */
export function formatText(reports: readonly CheckReport[]): string {
  const lines: string[] = [];
  for (const { id, result } of reports) {
    switch (result.status) {
      case "pass":
        lines.push(`${ICON.pass} ${id}: ${result.summary}`);
        break;
      case "skip":
        lines.push(`${ICON.skip} ${id}: skipped — ${result.reason}`);
        break;
      case "fail":
        lines.push(`${ICON.fail} ${id}: ${result.summary}`);
        for (const p of result.problems) {
          lines.push(`    - ${p.message}`);
          if (p.hint !== undefined) lines.push(`      ${p.hint}`);
        }
        break;
    }
  }
  const failed = reports.filter((r) => r.result.status === "fail").length;
  lines.push("", failed === 0 ? "All checks passed." : `${String(failed)} check(s) failed.`);
  return lines.join("\n");
}

/** 다른 도구가 읽는 리포트 (`--json`) */
export function formatJson(reports: readonly CheckReport[]): string {
  return JSON.stringify({ ok: !reports.some((r) => r.result.status === "fail"), checks: reports }, null, 2);
}
