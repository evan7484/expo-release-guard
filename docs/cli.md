# CLI reference

```
expo-release-guard init [--force] [--stdout]
expo-release-guard check [check id...] [options]
expo-release-guard list
```

## `init`

Reads the current prebuild output and writes a `release-guard.config.json` draft. The goal is to **freeze today's output as the baseline**.

```bash
npx expo prebuild --clean --no-install
(cd android && ./gradlew :app:processReleaseMainManifest)   # optional — includes library permissions
npx expo-release-guard init
```

| Output | Goes into |
| --- | --- |
| `NS*UsageDescription` keys in `Info.plist` (non-empty) | `ios.infoPlist.requiredKeys` |
| Build setting `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES` | `ios.alternateIcons.names` |
| Permissions in the source manifest | `android.permissions.required` |
| Permissions marked `tools:node="remove"` in the source manifest | `android.permissions.forbidden` (`blockedInSource: true`) |
| Permissions only in the merged manifest (after the Gradle step) | `android.permissions.requiredMerged` |
| LAUNCHER `activity-alias` elements (when exactly one is enabled) | `android.launcherAliases` |
| Intent actions the main activity keeps, other than `MAIN` (when it uses aliases) | `android.launcherAliases.mainActivityActions` |

Every `reason` is set to `TODO: …` — replace them; they are what the next person reads when a check fails. What must **never** appear (location, contacts, background modes, …) cannot be inferred from the output, so add it to `forbidden` yourself.

| Option | Description |
| --- | --- |
| `--force` | Overwrite an existing config file. Without it, the existing file is kept and the exit code is `2`. |
| `--stdout` | Print the JSON instead of writing a file — useful to compare with your current config. |
| `--cwd <path>` | Project root. |

## `check`

Runs the registered checks. Pass ids to run only those.

```bash
npx expo-release-guard check                          # all default checks
npx expo-release-guard check ios-plist                # one check
npx expo-release-guard check ios-alternate-icons android-launcher-aliases
npx expo-release-guard check android-merged-manifest  # runs only when named
```

Checks that need an extra build step (`android-merged-manifest` — the Gradle merge) are not part of the default run; `list` marks them "(only when named)". A check without config is **skipped**, not failed.

| Option | Description |
| --- | --- |
| `-c, --config <path>` | Config file. Without it, `release-guard.config.json` → `.js` → `.mjs` are tried in order. |
| `--cwd <path>` | Project root to check. Defaults to the current directory; use it to target one app in a monorepo. |
| `--json` | Print results as JSON. |
| `-h, --help` | Show help. |

## `list`

Prints each registered check's id and title, separated by a tab.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Every check passed or was skipped. |
| `1` | At least one check failed. Block the release. |
| `2` | Usage or config error (unknown command, option or check id; no config file; malformed config). |

Separating check failures (`1`) from config errors (`2`) lets CI tell "the app is broken" from "the tool is misconfigured".

## JSON output

```json
{
  "ok": false,
  "checks": [
    {
      "id": "ios-plist",
      "title": "Required Info.plist keys in the prebuild output",
      "result": {
        "status": "fail",
        "summary": "1 of 3 Info.plist rule(s) violated",
        "problems": [
          { "message": "NSRemindersUsageDescription is missing or empty.", "hint": "…" }
        ]
      }
    }
  ]
}
```

`result.status` is `pass`, `fail` or `skip`, and each status has its own fields ([`CheckResult` in the API docs](api.md#checkresult)).
