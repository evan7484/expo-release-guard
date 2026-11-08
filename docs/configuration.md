# Configuration

## File lookup

The first of these files in the project root (`--cwd`) is used. You can also pass one with `--config`.

1. `release-guard.config.json`
2. `release-guard.config.js` (ESM, `export default`)
3. `release-guard.config.mjs`

The fastest way to start is `npx expo-release-guard init`, which writes a draft from your current prebuild output ([CLI docs](cli.md#init)).

In JS configs, `defineConfig` gives you type inference:

```js
// release-guard.config.mjs
import { defineConfig } from "expo-release-guard";

export default defineConfig({
  ios: {
    infoPlist: {
      requiredKeys: [{ key: "NSCameraUsageDescription", reason: "Profile photo capture." }],
    },
  },
});
```

## Schema

```ts
interface Config {
  ios?: {
    infoPlist?: {
      /** Info.plist path relative to cwd. Omit to find ios/<app name>/Info.plist. */
      path?: string;
      requiredKeys?: { key: string; reason: string }[];
      /** Without `values`, the key must not exist. With `values`, the key must not contain any of them. */
      forbidden?: { key: string; values?: string[]; reason: string }[];
    };
    alternateIcons?: {
      names: string[];
      projectPath?: string;
      assetCatalogPath?: string;
    };
  };
  android?: {
    permissions?: {
      required?: { name: string; reason: string }[];
      requiredMerged?: { name: string; reason: string }[];
      forbidden?: { name: string; reason: string; blockedInSource?: boolean }[];
      sourcePath?: string;
      mergedPath?: string;
    };
    launcherAliases?: {
      aliases: string[];
      enabledByDefault: string;
      mainActivity?: string;
      manifestPath?: string;
      mainActivityActions?: string[];
    };
  };
}
```

What each section means: [ios-plist](checks/ios-plist.md), [android-manifest](checks/android-manifest.md), [app-icons](checks/app-icons.md).

## Validation

The config is validated once when it is read. If it is malformed, no check runs; the error names the exact location and the exit code is `2`.

| Rule | Example error |
| --- | --- |
| `requiredKeys` is an array | ``ios.infoPlist.requiredKeys` must be an array.`` |
| Each item has string `key` and `reason` | ``ios.infoPlist.requiredKeys[0]` must be { key: string, reason: string }.`` |
| `key` is not empty | ``ios.infoPlist.requiredKeys[0].key` is empty.`` |
| No duplicate keys | ``ios.infoPlist.requiredKeys` lists A more than once.`` |
| A key cannot be both required and forbidden (without `values`) | ``ios.infoPlist`: A is both required and forbidden.`` |
| No duplicate permissions in a list (`CAMERA` and `android.permission.CAMERA` are the same) | ``android.permissions.forbidden` lists android.permission.CAMERA more than once.`` |
| A permission cannot be both required and forbidden | ``android.permissions`: CAMERA is both required and forbidden.`` |
| `blockedInSource` only in `forbidden` | ``android.permissions.required[0]`.blockedInSource is only allowed in forbidden.`` |
| `enabledByDefault` is one of `aliases` | ``android.launcherAliases.enabledByDefault` must be one of aliases.`` |

Why `reason` is mandatory: the keys that look unnecessary are exactly the ones that get deleted. The failure message has to carry the reason so the next person does not repeat the mistake.
