#!/usr/bin/env node
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { checks } from "./checks/index.js";
import { loadConfig } from "./config.js";
import { formatJson, formatText } from "./report.js";
import { hasFailure, runChecks } from "./run.js";

export const EXIT = { ok: 0, checkFailed: 1, usage: 2 } as const;

export interface Io {
  readonly stdout: (s: string) => void;
  readonly stderr: (s: string) => void;
  readonly cwd: string;
}

const HELP = `expo-release-guard — Expo prebuild 산출물을 릴리스 전에 검사합니다

사용법
  expo-release-guard check [검사 id...] [옵션]
  expo-release-guard list

옵션
  -c, --config <path>  설정 파일 경로 (기본: release-guard.config.{json,js,mjs})
      --cwd <path>     검사할 프로젝트 루트 (기본: 현재 디렉터리)
      --json           결과를 JSON으로 출력
  -h, --help           도움말

종료 코드
  0 통과 · 1 검사 실패 · 2 사용법·설정 오류`;

/** 테스트에서 프로세스를 띄우지 않고 부를 수 있게 입출력을 주입받는다. */
export async function main(argv: readonly string[], io: Io): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        config: { type: "string", short: "c" },
        cwd: { type: "string" },
        json: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (e) {
    io.stderr(`${e instanceof Error ? e.message : String(e)}\n\n${HELP}`);
    return EXIT.usage;
  }

  const { values, positionals } = parsed;
  const [command, ...ids] = positionals;
  if (values.help || command === undefined) {
    (values.help ? io.stdout : io.stderr)(HELP);
    return values.help ? EXIT.ok : EXIT.usage;
  }

  switch (command) {
    case "list":
      io.stdout(checks.map((c) => `${c.id}\t${c.title}${c.runsByDefault === false ? " (id 지정 시에만)" : ""}`).join("\n"));
      return EXIT.ok;
    case "check": {
      const cwd = path.resolve(io.cwd, values.cwd ?? ".");
      const loaded = await loadConfig(cwd, values.config);
      if (!loaded.ok) {
        io.stderr(loaded.error);
        return EXIT.usage;
      }
      const run = await runChecks({ cwd, config: loaded.value.config, only: ids });
      if (!run.ok) {
        io.stderr(run.error);
        return EXIT.usage;
      }
      io.stdout(values.json ? formatJson(run.value) : formatText(run.value));
      return hasFailure(run.value) ? EXIT.checkFailed : EXIT.ok;
    }
    default:
      io.stderr(`알 수 없는 명령: ${command}\n\n${HELP}`);
      return EXIT.usage;
  }
}

// 직접 실행될 때만 동작 — import해서 main을 테스트할 때는 실행하지 않는다
const entry = process.argv[1];
if (entry !== undefined && realpathSync(entry) === fileURLToPath(import.meta.url)) {
  const code = await main(process.argv.slice(2), {
    stdout: (s) => process.stdout.write(`${s}\n`),
    stderr: (s) => process.stderr.write(`${s}\n`),
    cwd: process.cwd(),
  });
  process.exitCode = code;
}
