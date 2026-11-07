# 프로그래밍 API

CLI가 하는 일을 코드에서 그대로 호출할 수 있습니다. 패키지는 ESM 전용입니다.

```ts
import { formatText, hasFailure, loadConfig, runChecks } from "expo-release-guard";

const cwd = process.cwd();
const loaded = await loadConfig(cwd);
if (!loaded.ok) throw new Error(loaded.error);

const run = await runChecks({ cwd, config: loaded.value.config, only: ["ios-plist"] });
if (!run.ok) throw new Error(run.error);

console.log(formatText(run.value));
if (hasFailure(run.value)) process.exitCode = 1;
```

## 함수

| 이름 | 시그니처 | 설명 |
| --- | --- | --- |
| `loadConfig` | `(cwd, explicitPath?) => Promise<Result<{ config, file }>>` | 설정 파일을 찾아 읽고 검증 |
| `parseConfig` | `(raw: unknown) => Result<Config>` | 이미 읽은 값을 `Config`로 검증 |
| `defineConfig` | `(config: Config) => Config` | JS 설정 파일용 타입 도우미 |
| `runChecks` | `({ cwd, config, only? }) => Promise<Result<CheckReport[]>>` | 검사 실행. 한 검사가 throw해도 나머지는 계속 돌고 그 검사는 `fail`로 기록 |
| `hasFailure` | `(reports) => boolean` | `fail`이 하나라도 있는지 |
| `formatText` / `formatJson` | `(reports) => string` | CLI와 같은 형식으로 출력 |

## 타입

### `Result<T>`

예상 가능한 실패(설정 없음, 알 수 없는 검사 id)는 throw하지 않고 값으로 돌려줍니다.

```ts
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
```

### `CheckResult`

상태마다 가진 필드가 다른 판별 유니온입니다. `status`로 좁히면 `problems`·`reason`에 안전하게 접근할 수 있습니다.

```ts
type CheckResult =
  | { status: "pass"; summary: string }
  | { status: "fail"; summary: string; problems: readonly Problem[] }
  | { status: "skip"; reason: string };

interface Problem {
  message: string;
  hint?: string; // 왜 필요한지
}
```
