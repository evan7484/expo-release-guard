# 설정 레퍼런스

## 파일 위치

프로젝트 루트(`--cwd`)에서 아래 순서로 첫 번째 파일을 씁니다. `--config`로 직접 지정할 수도 있습니다.

1. `release-guard.config.json`
2. `release-guard.config.js` (ESM, `export default`)
3. `release-guard.config.mjs`

JS 설정에서는 `defineConfig`로 타입 추론을 받을 수 있습니다.

```js
// release-guard.config.mjs
import { defineConfig } from "expo-release-guard";

export default defineConfig({
  ios: {
    infoPlist: {
      requiredKeys: [{ key: "NSCameraUsageDescription", reason: "인증 사진 촬영" }],
    },
  },
});
```

## 스키마

```ts
interface Config {
  ios?: {
    infoPlist?: {
      /** cwd 기준 Info.plist 경로. 생략하면 ios/<앱 이름>/Info.plist를 찾는다. */
      path?: string;
      requiredKeys: { key: string; reason: string }[];
    };
  };
}
```

설정은 읽을 때 한 번 검증합니다. 모양이 틀리면 검사를 돌리지 않고 어느 위치가 틀렸는지 알려 준 뒤 종료 코드 `2`로 끝납니다.

| 규칙 | 오류 예 |
| --- | --- |
| `requiredKeys`는 배열 | ``ios.infoPlist.requiredKeys`는 배열이어야 합니다.`` |
| 각 항목은 `key`와 `reason`이 모두 문자열 | ``ios.infoPlist.requiredKeys[0]`는 { key: string, reason: string } 이어야 합니다.`` |
| `key`는 비어 있지 않음 | ``ios.infoPlist.requiredKeys[0].key`가 비었습니다.`` |
| `key`는 중복 불가 | ``ios.infoPlist.requiredKeys`에 A가 중복됩니다.`` |

`reason`을 필수로 둔 이유: 필요 없어 보이는 키일수록 지워지기 쉽습니다. 실패 메시지에 이유가 함께 나와야 다음 사람이 같은 실수를 반복하지 않습니다.
