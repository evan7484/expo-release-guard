# `ios-plist`

Checks the `Info.plist` in the prebuild output: required keys must be present as **non-empty strings**, and forbidden keys or values must be absent.

## Why check the output

Putting a key in `app.json`'s `ios.infoPlist` is not enough — a config plugin can delete or overwrite it during prebuild, and tests that look at the input still pass. Some native modules read usage-description keys **at launch**, so a missing key means the build and upload succeed and the app dies on the splash screen.

The opposite also happens: a plugin meant for another platform can pull an iOS background mode or capability into the output, and App Review asks you to justify it.

## Config

```json
{
  "ios": {
    "infoPlist": {
      "path": "ios/MyApp/Info.plist",
      "requiredKeys": [
        { "key": "NSRemindersUsageDescription", "reason": "expo-calendar reads it on launch." }
      ],
      "forbidden": [
        { "key": "UIBackgroundModes", "values": ["processing"], "reason": "Android-only background task; no iOS justification." },
        { "key": "NSLocationAlwaysUsageDescription", "reason": "We never use location." }
      ]
    }
  }
}
```

| Field | Required | Description |
| --- | --- | --- |
| `requiredKeys` | no | Keys that must be non-empty strings, with the reason. |
| `forbidden` | no | Without `values`: the key must not exist. With `values`: the key's value (a string or an array of strings) must contain none of them. |
| `path` | no | `Info.plist` path. Found automatically when omitted. |

The check is skipped when both `requiredKeys` and `forbidden` are empty.

### Automatic path lookup

Looks for a directory directly under `ios/` that contains `Info.plist`, excluding:

- `Pods`, `build`, `DerivedData`
- names containing `.` (`*.xcodeproj`, `*.xcworkspace`)
- names ending in `Tests`

With no candidate it tells you to run prebuild first. **With two or more it fails instead of picking one** — set `path`.

## Result

| Status | When |
| --- | --- |
| `pass` | Every required key is a non-empty string and no forbidden key/value is present |
| `fail` | A required key is missing, empty, whitespace-only or not a string / a forbidden key or value is present / `Info.plist` is missing or unparsable / several candidates |
| `skip` | No `ios.infoPlist` config, or no rules in it |
