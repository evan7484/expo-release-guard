# `ios-plist`

prebuild 산출물의 `Info.plist`에 필수 키가 **비어 있지 않은 문자열**로 남아 있는지 검사합니다.

## 왜 산출물을 보나

`app.json`의 `ios.infoPlist`에 키를 넣어도, config plugin이 prebuild 중에 키를 지우거나 덮어쓸 수 있습니다. 입력을 검사하는 테스트는 이 경우를 통과시킵니다. 권한 키 중 일부는 네이티브 모듈이 **앱 시작 시** 조회하므로, 빠지면 빌드·업로드는 성공하고 실행만 실패합니다.

## 설정

```json
{
  "ios": {
    "infoPlist": {
      "path": "ios/MyApp/Info.plist",
      "requiredKeys": [{ "key": "NSRemindersUsageDescription", "reason": "expo-calendar가 앱 시작 시 조회" }]
    }
  }
}
```

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| `requiredKeys` | 예 | 검사할 키와 그 이유. 비어 있으면 검사를 건너뜁니다. |
| `path` | 아니오 | `Info.plist` 경로. 생략하면 자동으로 찾습니다. |

### 경로 자동 탐색

`ios/` 바로 아래 디렉터리 중 `Info.plist`가 있는 것을 찾습니다. 다음은 앱 타깃이 아니므로 제외합니다.

- `Pods`, `build`, `DerivedData`
- 이름에 `.`이 들어간 것 (`*.xcodeproj`, `*.xcworkspace`)
- 이름이 `Tests`로 끝나는 것

후보가 0개면 prebuild를 먼저 하라고 안내하고, **2개 이상이면 하나를 고르지 않고 실패**합니다. 그때는 `path`를 지정하세요.

## 결과

| 상태 | 조건 |
| --- | --- |
| `pass` | 모든 키가 비어 있지 않은 문자열 |
| `fail` | 키가 없음 · 빈 문자열 · 공백뿐 · 문자열이 아님 / `Info.plist`가 없음 / 해석 불가 / 후보가 여럿 |
| `skip` | `ios.infoPlist` 설정이 없거나 `requiredKeys`가 비어 있음 |
