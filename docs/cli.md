# CLI 레퍼런스

```
expo-release-guard init [--force] [--stdout]
expo-release-guard check [검사 id...] [옵션]
expo-release-guard list
```

## `init`

지금 prebuild 산출물을 읽어 `release-guard.config.json` 초안을 만듭니다. **지금 상태를 기준선으로 고정**하는 것이 목적입니다.

```bash
npx expo prebuild --clean --no-install
(cd android && ./gradlew :app:processReleaseMainManifest)   # 선택 — 라이브러리 권한까지 담으려면
npx expo-release-guard init
```

| 산출물 | 초안에 들어가는 것 |
| --- | --- |
| `Info.plist`의 `NS*UsageDescription` (값이 비지 않은 것) | `ios.infoPlist.requiredKeys` |
| 빌드 설정 `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES` | `ios.alternateIcons.names` |
| 소스 매니페스트 권한 | `android.permissions.required` |
| 소스 매니페스트의 `tools:node="remove"` 권한 | `android.permissions.forbidden` (`blockedInSource: true`) |
| 병합 매니페스트에만 있는 권한 (Gradle 단계 뒤) | `android.permissions.requiredMerged` |
| LAUNCHER `activity-alias` (켜진 것이 정확히 하나일 때) | `android.launcherAliases` |

모든 `reason`은 `TODO: …`로 채워지니 직접 고치세요. 실패했을 때 다음 사람이 보는 설명입니다. 무엇을 **금지**할지(위치·연락처 등)는 산출물이 말해 주지 않으므로 `forbidden`에 직접 더해야 합니다.

| 옵션 | 설명 |
| --- | --- |
| `--force` | 이미 있는 설정 파일을 덮어씁니다. 없으면 기존 파일을 지키고 종료 코드 `2`로 끝납니다. |
| `--stdout` | 파일을 만들지 않고 JSON을 출력합니다. 기존 설정과 비교할 때 씁니다. |
| `--cwd <path>` | 프로젝트 루트. |

## `check`

등록된 검사를 실행합니다. 검사 id를 주면 그 검사만 실행합니다.

```bash
npx expo-release-guard check                          # 기본 검사 전부
npx expo-release-guard check ios-plist                # 하나만
npx expo-release-guard check ios-alternate-icons android-launcher-aliases
npx expo-release-guard check android-merged-manifest  # id 지정 시에만 도는 검사
```

별도 빌드 단계가 필요한 검사(`android-merged-manifest` — Gradle 병합)는 기본 실행에 포함되지 않습니다. `list`에서 "(id 지정 시에만)"으로 표시됩니다.

| 옵션 | 설명 |
| --- | --- |
| `-c, --config <path>` | 설정 파일 경로. 생략하면 `release-guard.config.json` → `.js` → `.mjs` 순으로 찾습니다. |
| `--cwd <path>` | 검사할 프로젝트 루트. 생략하면 현재 디렉터리입니다. 모노레포에서 앱 하나를 지정할 때 씁니다. |
| `--json` | 결과를 JSON으로 출력합니다. |
| `-h, --help` | 도움말을 출력합니다. |

## `list`

등록된 검사의 id와 설명을 탭으로 구분해 출력합니다.

## 종료 코드

| 코드 | 의미 |
| --- | --- |
| `0` | 모든 검사가 통과했거나 건너뛰었습니다. |
| `1` | 하나 이상의 검사가 실패했습니다. 릴리스를 막아야 합니다. |
| `2` | 사용법 오류 또는 설정 오류입니다 (알 수 없는 명령·옵션·검사 id, 설정 파일 없음, 설정 모양이 틀림). |

검사 실패(1)와 설정 오류(2)를 구분하므로, CI에서 "앱이 잘못됐다"와 "도구를 잘못 썼다"를 나눠 볼 수 있습니다.

## JSON 출력

```json
{
  "ok": false,
  "checks": [
    {
      "id": "ios-plist",
      "title": "prebuild 산출물 Info.plist의 필수 키",
      "result": {
        "status": "fail",
        "summary": "필수 키 3개 중 1개 누락",
        "problems": [
          { "message": "NSRemindersUsageDescription가 없거나 비었습니다.", "hint": "…" }
        ]
      }
    }
  ]
}
```

`result.status`는 `pass` · `fail` · `skip` 중 하나이고, 상태마다 필드가 다릅니다 ([API 문서의 `CheckResult`](api.md#checkresult)).
