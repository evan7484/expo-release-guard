# `android-manifest` · `android-merged-manifest`

Checks that the Android manifest **has the permissions it must have and none it must not**. The same rules are applied to two stages of output.

| id | File | Default run | Catches |
| --- | --- | --- | --- |
| `android-manifest` | Prebuild output `android/app/src/main/AndroidManifest.xml` | yes | `blockedPermissions` dropped from `app.json` (removal directive gone), forbidden permission declared directly |
| `android-merged-manifest` | Gradle merge result (`android/app/build/intermediates/merged_manifest*/release/…`) | no (run by id) | Forbidden permission revived from a library manifest, a library-provided permission missing |

## Why two stages

- **Only visible in the source.** `app.json`'s `android.blockedPermissions` writes entries with `tools:node="remove"` into the source manifest. If that setting disappears, the entries **vanish entirely** from the source, and the permission silently comes back from a library manifest during the merge. So the source stage does not treat "absent" as safe; it checks that **the removal directive is there** (`blockedInSource: true`).
- **Only visible after the merge.** Permissions added by libraries — like `POST_NOTIFICATIONS` from `expo-notifications` — are not in the source, only in the merged manifest. The merged manifest is also what actually ships.

The merged check needs the Gradle step, so it is not part of the default run. Run it by id:

```bash
npx expo prebuild --platform android --no-install
npx expo-release-guard check android-manifest

(cd android && ./gradlew :app:processReleaseMainManifest)
npx expo-release-guard check android-merged-manifest
```

## Config

```json
{
  "android": {
    "permissions": {
      "required": [{ "name": "INTERNET", "reason": "Talks to our API." }],
      "requiredMerged": [{ "name": "POST_NOTIFICATIONS", "reason": "Added by expo-notifications. Missing = no push prompt on Android 13+." }],
      "forbidden": [
        { "name": "CAMERA", "reason": "We only pick from the photo library.", "blockedInSource": true },
        { "name": "READ_CONTACTS", "reason": "We never read contacts." }
      ]
    }
  }
}
```

| Field | Description |
| --- | --- |
| `required` | Must be present in both the source and the merged manifest |
| `requiredMerged` | Must be present in the merged manifest only (library-provided) |
| `forbidden` | Must not end up in the app. With `blockedInSource: true` the source must carry a removal directive |
| `sourcePath` | Source manifest path (default `android/app/src/main/AndroidManifest.xml`) |
| `mergedPath` | Merged manifest path. Found automatically when omitted |

A short name like `CAMERA` means `android.permission.CAMERA`. Names containing a dot, like `com.google.android.gms.permission.AD_ID`, are used as-is. Short and full names are the same permission, so listing both is a config error.

## Rules

| Stage | Rule | Fails when |
| --- | --- | --- |
| source | `forbidden` + `blockedInSource` | the entry is missing / declared without `tools:node="remove"` |
| source | `forbidden` | declared without a removal directive |
| merged | `forbidden` | present in the merged manifest |
| both | `required` (merged also `requiredMerged`) | missing / carries a removal directive |

- `<uses-permission-sdk-23>` is a different tag and is not mixed in.
- With several merged-manifest candidates (multiple flavors, or AGP moved the path), it fails and asks for `mergedPath` instead of picking one.
