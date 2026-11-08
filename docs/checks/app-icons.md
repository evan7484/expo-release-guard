# `ios-alternate-icons` · `android-launcher-aliases`

앱 아이콘을 바꾸는 기능(iOS `setAlternateIconName`, Android 런처 별칭)이 prebuild 산출물에 제대로 등록됐는지 검사합니다.

## 왜 산출물을 보나

아이콘 변경은 config plugin이 네이티브 프로젝트 **여러 곳을 함께** 고쳐야 동작합니다. 한 곳만 빠져도 빌드·업로드는 통과하고, 사용자가 아이콘을 바꾸는 순간에만 실패합니다.

- iOS: 빌드 설정 `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES`와 에셋 카탈로그의 `<이름>.appiconset`이 둘 다 있어야 합니다. 하나라도 빠지면 아이콘 변경이 조용히 실패합니다.
- Android: 아이콘마다 `<activity-alias>`가 있고, LAUNCHER intent-filter를 갖고, **기본으로 켜진 별칭은 정확히 하나**여야 합니다. 0개면 런처에서 앱이 사라지고, 2개 이상이면 아이콘이 여럿 보입니다. 메인 액티비티에 LAUNCHER가 남아 있어도 아이콘이 하나 더 생깁니다.

## 설정

```json
{
  "ios": {
    "alternateIcons": { "names": ["Sunny", "Rainy"] }
  },
  "android": {
    "launcherAliases": {
      "aliases": ["MainActivityDefault", "MainActivitySunny", "MainActivityRainy"],
      "enabledByDefault": "MainActivityDefault"
    }
  }
}
```

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| `ios.alternateIcons.names` | 예 | 대체 아이콘 이름. 빌드 설정과 `<이름>.appiconset`을 모두 확인합니다. |
| `ios.alternateIcons.projectPath` | 아니오 | `project.pbxproj` 경로. 생략하면 `ios/*.xcodeproj`(Pods 제외)를 찾고, 여럿이면 지정을 요구합니다. |
| `ios.alternateIcons.assetCatalogPath` | 아니오 | `.xcassets` 경로. 생략하면 `Info.plist` 옆의 `Images.xcassets`. |
| `android.launcherAliases.aliases` | 예 | 별칭 `android:name`의 끝부분. |
| `android.launcherAliases.enabledByDefault` | 예 | 기본으로 켜져 있어야 하는 별칭 (`aliases` 중 하나). |
| `android.launcherAliases.mainActivity` | 아니오 | 메인 액티비티 이름 끝부분. 기본 `.MainActivity`. |
| `android.launcherAliases.manifestPath` | 아니오 | 매니페스트 경로. 기본 prebuild 소스 매니페스트. |

## iOS가 잡는 것

| 문제 | 메시지 |
| --- | --- |
| 빌드 설정이 아예 없음 (plugin 누락) | `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES이 없습니다.` |
| 빌드 구성(Debug·Release) 중 하나라도 목록이 다름 | `…가 설정과 다릅니다 (누락: … / 추가: …)` |
| `<이름>.appiconset`이 없음 | `<이름>.appiconset이 없습니다.` |
| `Contents.json`이 가리키는 이미지 파일이 없음 | `<이름>.appiconset에 실제 이미지 파일이 없습니다.` |

빌드 설정 값은 `"A B"`, `A`, `( A, "B", )` 세 가지 꼴을 모두 읽습니다.

## Android가 잡는 것

| 문제 | 메시지 |
| --- | --- |
| 별칭이 없음 | `별칭 X가 없습니다.` |
| 별칭에 LAUNCHER intent-filter가 없음 | `별칭 X에 LAUNCHER intent-filter가 없습니다.` |
| 기본 켜짐 상태가 기대와 다름 | `별칭 X가 기본 켜짐입니다 (기대: 꺼짐).` |
| 설정에 없는 별칭이 켜진 런처로 선언됨 | `설정에 없는 별칭 X가 켜진 런처로 선언돼 있습니다.` |
| 메인 액티비티에 LAUNCHER가 남음 | `메인 액티비티에 LAUNCHER intent-filter가 남아 있습니다.` |
| 메인 액티비티가 꺼짐 (딥링크·알림 진입이 끊김) | `메인 액티비티가 꺼져 있습니다.` |

`android:enabled`를 생략한 요소는 켜진 것으로 봅니다(Android 기본값).

## 결과

설정이 없으면 `skip`, 모두 맞으면 `pass`, 하나라도 어긋나면 `fail`이고 **어긋난 것을 한 번에 모두** 보고합니다.
