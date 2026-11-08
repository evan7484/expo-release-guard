# `ios-alternate-icons` · `android-launcher-aliases`

Checks that app-icon switching (iOS `setAlternateIconName`, Android launcher aliases) is correctly registered in the prebuild output.

## Why check the output

Icon switching works only when a config plugin edits **several places** of the native project together. If one is missing, the build and upload still pass; it fails only when a user switches icons.

- iOS: both the build setting `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES` and an `<name>.appiconset` in the asset catalog are needed. Missing either, the icon change fails silently.
- Android: each icon needs an `<activity-alias>` with a LAUNCHER intent-filter, and **exactly one alias may be enabled by default**. With none, the app disappears from the launcher; with two or more, it shows several icons. A LAUNCHER left on the main activity adds one more icon. And when the launcher moves to aliases, the main activity must keep its other entry points (deep links).

## Config

```json
{
  "ios": {
    "alternateIcons": { "names": ["Sunny", "Rainy"] }
  },
  "android": {
    "launcherAliases": {
      "aliases": ["MainActivityDefault", "MainActivitySunny", "MainActivityRainy"],
      "enabledByDefault": "MainActivityDefault",
      "mainActivityActions": ["android.intent.action.VIEW"]
    }
  }
}
```

| Field | Required | Description |
| --- | --- | --- |
| `ios.alternateIcons.names` | yes | Alternate icon names. Both the build setting and `<name>.appiconset` are checked. |
| `ios.alternateIcons.projectPath` | no | `project.pbxproj` path. Omit to find `ios/*.xcodeproj` (excluding Pods); several candidates require this. |
| `ios.alternateIcons.assetCatalogPath` | no | `.xcassets` path. Defaults to `Images.xcassets` next to `Info.plist`. |
| `android.launcherAliases.aliases` | yes | The end of each alias's `android:name`. |
| `android.launcherAliases.enabledByDefault` | yes | The alias that must be enabled by default (one of `aliases`). |
| `android.launcherAliases.mainActivity` | no | The end of the main activity's name. Default `.MainActivity`. |
| `android.launcherAliases.manifestPath` | no | Manifest path. Default: the prebuild source manifest. |
| `android.launcherAliases.mainActivityActions` | no | Intent actions the main activity must keep, e.g. `android.intent.action.VIEW` for deep links. |

## What iOS catches

| Problem | Message |
| --- | --- |
| No build setting at all (plugin missing) | `Build setting ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES is missing.` |
| A build configuration (Debug, Release) lists different icons | `… does not match the config (missing: … / extra: …).` |
| No `<name>.appiconset` | `<name>.appiconset does not exist.` |
| An image referenced by `Contents.json` does not exist | `<name>.appiconset has no actual image file.` |

The build setting is read in all three forms: `"A B"`, `A`, and `( A, "B", )`.

## What Android catches

| Problem | Message |
| --- | --- |
| Alias missing | `Alias X is missing.` |
| Alias without a LAUNCHER intent-filter | `Alias X has no LAUNCHER intent-filter.` |
| Default enabled state differs | `Alias X is enabled by default (expected: disabled).` |
| An alias not in the config is an enabled launcher | `Alias X is not in the config but is an enabled launcher.` |
| LAUNCHER left on the main activity | `The main activity still has a LAUNCHER intent-filter.` |
| Main activity disabled (deep links and notifications cannot open the app) | `The main activity is disabled.` |
| Main activity lost a required action | `The main activity lost its android.intent.action.VIEW intent-filter.` |

An element without `android:enabled` counts as enabled (Android's default).

## Result

`skip` without config, `pass` when everything matches, `fail` otherwise — and **every** mismatch is reported at once.
