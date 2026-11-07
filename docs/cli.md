# CLI 레퍼런스

```
expo-release-guard check [검사 id...] [옵션]
expo-release-guard list
```

## `check`

등록된 검사를 실행합니다. 검사 id를 주면 그 검사만 실행합니다.

```bash
npx expo-release-guard check                          # 기본 검사 전부
npx expo-release-guard check ios-plist                # 하나만
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
