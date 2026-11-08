# Changelog

## 0.2.0

- **`init`**: 지금 prebuild 산출물을 읽어 `release-guard.config.json` 초안을 만든다 — 권한 문구, 대체 아이콘, Android 권한(제거 지시자 포함), 병합본에만 있는 라이브러리 권한, 런처 별칭. `--force`, `--stdout`.
- **`ios-alternate-icons`**: 대체 앱 아이콘이 빌드 설정(Debug·Release 모두)과 에셋 카탈로그 양쪽에 등록됐는지, `Contents.json`이 가리키는 이미지가 실제로 있는지.
- **`android-launcher-aliases`**: 아이콘별 런처 별칭, 기본으로 켜진 별칭이 정확히 하나인지, 메인 액티비티가 런처가 아니면서 켜져 있는지.
- **GitHub Action** (`action.yml`): `uses: evan7484/expo-release-guard@v0`, 선택적으로 prebuild까지.
- README를 영어로, 한국어는 `README.ko.md`로.

새 검사는 기본 실행에 포함되며, 설정이 없으면 건너뛴다(기존 설정에는 영향 없음).

## 0.1.0

- 첫 배포: `ios-plist`, `android-manifest`, `android-merged-manifest`, `check`·`list`, JSON 출력.
