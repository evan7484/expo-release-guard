# expo-release-guard

**English** · [한국어](README.ko.md)

> A green build is not a launchable build.

A CLI that checks your Expo app's **prebuild output** — the generated `Info.plist`, `AndroidManifest.xml` (source and Gradle-merged), and app icon registration — before you ship. Run it in CI after `expo prebuild`; when a check fails, it tells you *what* is wrong and *why it must not be removed*.

```console
$ npx expo-release-guard check
✖ ios-plist: 1 of 3 Info.plist rule(s) violated
    - NSRemindersUsageDescription is missing or empty.
      expo-calendar reads this key on launch. Without it the app dies on the splash screen.
✔ android-manifest: android/app/src/main/AndroidManifest.xml: all 15 permission rule(s) satisfied

1 check(s) failed.
```

The indented line under each problem is the `reason` you wrote in your config.

## Why

We run a social routine app on the App Store and Google Play. One release **passed the EAS build, all 990 tests, and the App Store Connect upload — and crashed the moment it launched.**

- While adding a calendar import, we added a config plugin that stripped the "unused" Reminders permission key.
- `expo-calendar`'s iOS module reads that key **at startup** and terminates the app if it is missing.
- `app.json` (the input) was fine. Only the **prebuild output** was broken, so every test that looked at the input passed.
- The crash happened before Sentry initialized, so nothing was reported.

None of the green signals answered "does the app launch?". This tool closes that gap. It started as two scripts inside our app repository and became a config-driven CLI.

### Principles

1. **Check the output, not the input.** It reads what `expo prebuild` and Gradle actually generated, not `app.json`.
2. **Every rule carries a reason.** The reason is printed on failure, so the next person does not delete the same key again.
3. **Never guess.** If more than one candidate file exists, it fails and asks for an explicit path instead of picking one.

## Install

```bash
npm i -D expo-release-guard
```

Requires Node.js 22.12+.

## Quick start

```bash
npx expo prebuild --clean --no-install
npx expo-release-guard init     # writes release-guard.config.json from the current output
# fill in every "TODO" reason, then:
npx expo-release-guard check
```

`init` freezes **today's output as the baseline**: usage-description keys, alternate icons, Android permissions (including those marked `tools:node="remove"`), launcher aliases and the main activity's remaining entry points. Add anything that must *never* appear (location, contacts, background modes, …) to `forbidden` yourself — the output cannot tell you that.

A hand-written config looks like this:

```json
{
  "ios": {
    "infoPlist": {
      "requiredKeys": [
        { "key": "NSRemindersUsageDescription", "reason": "expo-calendar reads it on launch. Missing = crash on splash." }
      ],
      "forbidden": [
        { "key": "UIBackgroundModes", "values": ["processing"], "reason": "Pulled in by an Android-only task; App Review asks why." }
      ]
    }
  },
  "android": {
    "permissions": {
      "requiredMerged": [
        { "name": "POST_NOTIFICATIONS", "reason": "Added by expo-notifications. Missing = no push prompt on Android 13+." }
      ],
      "forbidden": [
        { "name": "CAMERA", "reason": "We only pick from the photo library.", "blockedInSource": true }
      ]
    }
  }
}
```

## Checks

| id | What it checks | Docs |
| --- | --- | --- |
| `ios-plist` | Required `Info.plist` keys are non-empty strings, and forbidden keys or values (e.g. a background mode) are absent | [ios-plist](docs/checks/ios-plist.md) |
| `ios-alternate-icons` | Alternate app icons are registered in **both** the build setting and the asset catalog | [app-icons](docs/checks/app-icons.md) |
| `android-manifest` | Required / forbidden permissions in the generated source manifest, and that blocked permissions keep their `tools:node="remove"` directive | [android-manifest](docs/checks/android-manifest.md) |
| `android-merged-manifest` | Required / forbidden permissions in the **Gradle-merged** manifest (what actually ships). Run by id after `processReleaseMainManifest` | [android-manifest](docs/checks/android-manifest.md) |
| `android-launcher-aliases` | One alias per icon, each a LAUNCHER, exactly one enabled by default; the main activity stays enabled, is not a launcher, and keeps its deep-link actions | [app-icons](docs/checks/app-icons.md) |

Two Android traps these catch that input checks miss:

- **"Absent" is not "safe."** If `blockedPermissions` is dropped from `app.json`, the removal line disappears from the source manifest and the permission silently comes back from a library during the merge. The source check therefore requires the removal *directive*, not just absence.
- **Library permissions only exist after the merge.** `POST_NOTIFICATIONS` from `expo-notifications` never appears in the source manifest, so it is checked on the merged one.

## CI

### GitHub Action

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with: { node-version: 22 }
- run: npm ci
- uses: evan7484/expo-release-guard@v0
  with:
    prebuild: all          # none | ios | android | all
    version: 0.3.0         # pin for reproducible CI
```

Inputs: `checks` (space-separated ids), `config`, `working-directory`, `prebuild`, `version`.

### Any CI

```yaml
- run: npx expo prebuild --clean --no-install
- run: npx expo-release-guard check
- run: cd android && ./gradlew :app:processReleaseMainManifest
- run: npx expo-release-guard check android-merged-manifest
```

Exit codes: `0` passed · `1` a check failed · `2` usage or config error — so CI can tell "the app is broken" from "the tool is misconfigured".

Tip: if adding a dependency or script changes your native fingerprint (and breaks OTA updates), skip `npm i -D` and call `npx --yes expo-release-guard@<version>` in CI instead.

## Docs

- [CLI reference](docs/cli.md) — `init`, `check`, `list`, exit codes, JSON output
- [Configuration](docs/configuration.md) — file lookup and schema
- [Programmatic API](docs/api.md)
- [Adding a check](CONTRIBUTING.md)

## License

MIT
