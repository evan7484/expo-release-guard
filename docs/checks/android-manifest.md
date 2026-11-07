# `android-manifest` · `android-merged-manifest`

Android 매니페스트에 **있어야 할 권한은 있고, 있으면 안 되는 권한은 없는지** 검사합니다. 같은 규칙을 두 단계의 산출물에 적용합니다.

| id | 보는 파일 | 기본 실행 | 잡는 사고 |
| --- | --- | --- | --- |
| `android-manifest` | prebuild 산출물 `android/app/src/main/AndroidManifest.xml` | 예 | `blockedPermissions` 설정이 빠져 제거 지시자가 사라짐, 금지 권한 직접 선언 |
| `android-merged-manifest` | Gradle 병합본 (`android/app/build/intermediates/merged_manifest*/release/…`) | 아니오 (id 지정) | 라이브러리 매니페스트에서 금지 권한이 되살아남, 라이브러리가 넣어야 할 권한이 빠짐 |

## 왜 두 단계인가

- **소스에서만 보이는 것.** `app.json`의 `android.blockedPermissions`는 소스 매니페스트에 `tools:node="remove"`가 붙은 항목을 만듭니다. 이 설정이 지워지면 항목이 소스에서 **통째로 사라지고**, 병합 때 라이브러리 매니페스트에서 권한이 조용히 되살아납니다. 그래서 소스 단계에서는 "없으면 안전"이 아니라 **"제거 지시자가 붙어 있는가"**를 봅니다 (`blockedInSource: true`).
- **병합본에서만 보이는 것.** `expo-notifications`의 `POST_NOTIFICATIONS`처럼 라이브러리가 넣는 권한은 소스에 없고 병합본에만 있습니다. 최종적으로 앱에 실리는 것도 병합본입니다.

병합 검사는 Gradle 단계가 있어야 하므로 기본 실행에서 빠집니다. id로 실행하세요.

```bash
npx expo prebuild --platform android --no-install
npx expo-release-guard check android-manifest

(cd android && ./gradlew :app:processReleaseMainManifest)
npx expo-release-guard check android-merged-manifest
```

## 설정

```json
{
  "android": {
    "permissions": {
      "required": [{ "name": "INTERNET", "reason": "서버 통신" }],
      "requiredMerged": [{ "name": "POST_NOTIFICATIONS", "reason": "expo-notifications가 넣는다. 없으면 Android 13+에서 푸시 권한 요청 불가" }],
      "forbidden": [
        { "name": "CAMERA", "reason": "사진은 앨범 선택만 쓴다", "blockedInSource": true },
        { "name": "READ_CONTACTS", "reason": "연락처를 읽는 기능이 없다" }
      ]
    }
  }
}
```

| 필드 | 설명 |
| --- | --- |
| `required` | 소스·병합 모두에 있어야 하는 권한 |
| `requiredMerged` | 병합본에만 있으면 되는 권한 (라이브러리가 넣는 것) |
| `forbidden` | 최종 앱에 남으면 안 되는 권한. `blockedInSource: true`면 소스에서 제거 지시자를 요구 |
| `sourcePath` | 소스 매니페스트 경로 (기본 `android/app/src/main/AndroidManifest.xml`) |
| `mergedPath` | 병합 매니페스트 경로. 생략하면 자동 탐색 |

권한 이름은 `CAMERA`처럼 짧게 쓰면 `android.permission.CAMERA`로 봅니다. `com.google.android.gms.permission.AD_ID`처럼 점이 들어간 이름은 그대로 봅니다. 짧은 이름과 전체 이름은 같은 권한으로 취급하므로 중복으로 적으면 설정 오류입니다.

## 판정

| 모드 | 규칙 | 실패 조건 |
| --- | --- | --- |
| 소스 | `forbidden` + `blockedInSource` | 항목이 없음 / `tools:node="remove"` 없이 선언 |
| 소스 | `forbidden` | 제거 지시자 없이 선언 |
| 병합 | `forbidden` | 병합본에 남아 있음 |
| 둘 다 | `required` (병합은 `requiredMerged` 포함) | 없음 / 제거 지시자가 붙음 |

- `<uses-permission-sdk-23>`은 다른 태그로 보고 섞지 않습니다.
- 병합본 후보가 여럿이면(flavor가 여럿이거나 AGP가 경로를 바꾼 경우) 하나를 골라 통과시키지 않고 `mergedPath`를 요구합니다.
