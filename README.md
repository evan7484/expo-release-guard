# expo-release-guard

> 빌드 성공은 실행 가능을 뜻하지 않는다.

Expo 앱의 **prebuild 산출물**을 릴리스 전에 검사하는 CLI입니다. CI에서 한 줄로 돌리고, 실패하면 무엇이 왜 필요한지 함께 알려 줍니다.

```console
$ npx expo-release-guard check
✖ ios-plist: 필수 키 3개 중 1개 누락
    - NSRemindersUsageDescription가 없거나 비었습니다.
      안 쓰지만 필수 — expo-calendar가 앱 시작 시 조회한다. 없으면 스플래시에서 종료.

1개 검사가 실패했습니다.
```

## 왜 만들었나

소셜 루틴 앱을 운영하면서, **EAS 빌드 성공 · 테스트 990개 통과 · App Store Connect 업로드 성공**을 모두 거친 빌드가 실기기에서 켜자마자 꺼진 적이 있습니다.

- 캘린더 기능을 붙이며 "쓰지 않는 권한"인 미리알림 키를 지우는 config plugin을 넣었는데,
- `expo-calendar`의 iOS 모듈은 **앱 시작 시** 그 키를 조회했고, 키가 없으면 즉시 종료했습니다.
- `app.json`(입력)은 멀쩡했고 prebuild **산출물**만 망가져 있어서, 입력을 보는 테스트로는 잡을 수 없었습니다.
- 크래시가 오류 수집 도구 초기화보다 먼저 일어나 Sentry에도 기록이 남지 않았습니다.

통과한 신호 중 어느 것도 "앱이 켜지는가"를 보지 않았습니다. 이 도구는 그 구멍을 막기 위해, 서비스 저장소 안에 흩어져 있던 릴리스 사전 검사 스크립트를 설정 기반의 독립 CLI로 옮긴 것입니다.

**원칙**

1. **입력이 아니라 산출물을 본다.** `app.json`이 아니라 `expo prebuild`가 만든 `ios/`, `android/`와 Gradle 병합 결과를 검사합니다.
2. **이유를 같이 적는다.** 필수 항목마다 `reason`을 받아, 실패 메시지에 "왜 지우면 안 되는지"를 보여 줍니다. 다음 사람이 같은 키를 다시 지우지 않게 하기 위해서입니다.
3. **추측하지 않는다.** 대상 파일 후보가 여럿이면 하나를 골라 통과시키지 않고 경로 설정을 요구합니다.

## 설치

```bash
npm i -D expo-release-guard
```

Node.js 22.12 이상이 필요합니다.

## 빠른 시작

1. 프로젝트 루트에 `release-guard.config.json`을 만듭니다.

   ```json
   {
     "ios": {
       "infoPlist": {
         "requiredKeys": [
           { "key": "NSCalendarsUsageDescription", "reason": "캘린더 가져오기. 없으면 권한 요청 자체가 불가." },
           { "key": "NSRemindersUsageDescription", "reason": "expo-calendar가 앱 시작 시 조회한다. 없으면 스플래시에서 종료." }
         ]
       }
     }
   }
   ```

2. prebuild 뒤에 실행합니다.

   ```bash
   npx expo prebuild --platform ios --clean --no-install
   npx expo-release-guard check
   ```

3. CI에 붙입니다 (GitHub Actions 예시).

   ```yaml
   - run: npx expo prebuild --clean --no-install
   - run: npx expo-release-guard check            # ios-plist · android-manifest
   - run: cd android && ./gradlew :app:processReleaseMainManifest
   - run: npx expo-release-guard check android-merged-manifest
   ```

## 검사 목록

| id | 하는 일 | 문서 |
| --- | --- | --- |
| `ios-plist` | prebuild 산출물 `Info.plist`에 필수 키가 비어 있지 않은 문자열로 남아 있는지 | [docs/checks/ios-plist.md](docs/checks/ios-plist.md) |
| `android-manifest` | prebuild 산출물 매니페스트의 필수·금지 권한, `blockedPermissions` 제거 지시자 | [docs/checks/android-manifest.md](docs/checks/android-manifest.md) |
| `android-merged-manifest` | Gradle 병합 매니페스트(최종본)의 필수·금지 권한 — id를 지정해 실행 | [docs/checks/android-manifest.md](docs/checks/android-manifest.md) |

이식 예정: 대체 앱 아이콘 등록 검사, OTA 채널·런타임 버전 대조.

## 문서

- [CLI 레퍼런스](docs/cli.md) — 명령, 옵션, 종료 코드, JSON 출력 형식
- [설정 레퍼런스](docs/configuration.md) — 설정 파일 위치와 스키마
- [프로그래밍 API](docs/api.md) — 다른 도구에서 검사를 호출하기
- [검사 추가하기](CONTRIBUTING.md) — 새 검사를 만드는 방법과 디렉터리 구조

## 라이선스

MIT
