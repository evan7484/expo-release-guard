# Programmatic API

Everything the CLI does can be called from code. The package is ESM-only.

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

## Functions

| Name | Signature | Description |
| --- | --- | --- |
| `loadConfig` | `(cwd, explicitPath?) => Promise<Result<{ config, file }>>` | Find, read and validate the config file |
| `parseConfig` | `(raw: unknown) => Result<Config>` | Validate an already-read value as `Config` |
| `defineConfig` | `(config: Config) => Config` | Type helper for JS config files |
| `runChecks` | `({ cwd, config, only? }) => Promise<Result<CheckReport[]>>` | Run checks. If one throws, the rest still run and that one is recorded as `fail` |
| `hasFailure` | `(reports) => boolean` | Whether any check failed |
| `formatText` / `formatJson` | `(reports) => string` | Same output as the CLI |
| `buildInitialConfig` | `(cwd) => Result<{ config, notes }>` | What `init` writes: a config draft from the current prebuild output |

## Types

### `Result<T>`

Expected failures (no config, unknown check id) are returned as values, not thrown.

```ts
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
```

### `CheckResult`

A discriminated union whose fields depend on the status. Narrow on `status` to reach `problems` or `reason` safely.

```ts
type CheckResult =
  | { status: "pass"; summary: string }
  | { status: "fail"; summary: string; problems: readonly Problem[] }
  | { status: "skip"; reason: string };

interface Problem {
  message: string;
  hint?: string; // why it matters — usually the `reason` from your config
}
```
