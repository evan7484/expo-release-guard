# 기여 가이드

## 개발

```bash
npm ci
npm test          # Vitest
npm run lint      # ESLint (typescript-eslint strictTypeChecked)
npm run typecheck # tsc --noEmit
npm run build     # tsup → dist/
npm run check:package  # publint + are-the-types-wrong
```

PR마다 CI가 Node 22·24에서 lint·typecheck·test를 돌리고, 배포될 tarball을 실제로 설치해 CLI를 실행해 봅니다.

## 디렉터리 구조

```
src/
  cli.ts            인자 해석·종료 코드. 입출력을 주입받아 프로세스 없이 테스트한다
  index.ts          공개 API — 여기서 export하지 않은 것은 내부 구현
  config.ts         설정 파일 탐색·읽기·검증 (외부 입력은 여기서만 unknown → Config로 좁힌다)
  run.ts            검사 선택·실행, 검사 하나의 예외가 나머지를 막지 않게
  report.ts         텍스트·JSON 출력
  plist.ts          @expo/plist CJS interop을 한 곳에 가둔다
  types.ts          CheckResult·Result 등 공용 타입
  checks/
    index.ts        검사 등록부
    types.ts        Check 인터페이스
    ios-plist.ts    검사 하나 = 파일 하나
test/
  fixtures/         CLI 스모크 테스트용 샘플 Expo 프로젝트
  helpers.ts        임시 프로젝트를 만드는 도우미
docs/               사용자 문서 (README에서 링크)
```

## 검사 추가하기

1. `src/checks/<id>.ts`에 `Check`를 구현합니다. 설정이 없으면 `fail`이 아니라 `skip`을 돌려주세요.
2. 순수 로직은 `run<Id>(cwd, options)`처럼 따로 export해 테스트하기 쉽게 합니다.
3. `src/checks/index.ts`의 `checks` 배열에 추가합니다.
4. 설정이 필요하면 `src/config.ts`의 `Config` 타입과 `parseConfig`에 검증을 추가합니다.
5. `test/<id>.test.ts`에 통과·실패·건너뜀·잘못된 입력 경우를 씁니다.
6. `docs/checks/<id>.md`를 쓰고 README 검사 목록에 한 줄 추가합니다.

## 원칙

- 실패 메시지는 "무엇이 틀렸는지"와 "무엇을 하면 되는지"를 함께 말합니다.
- 후보가 여럿이면 추측하지 말고 설정을 요구합니다.
- `any`를 쓰지 않습니다. 외부 입력은 `unknown`으로 받아 좁힙니다.
