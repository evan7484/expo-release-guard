# Contributing

## Development

```bash
npm ci
npm test               # Vitest
npm run lint           # ESLint (typescript-eslint strictTypeChecked)
npm run typecheck      # tsc --noEmit
npm run build          # tsup → dist/
npm run check:package  # publint + are-the-types-wrong
```

On every PR, CI runs lint, typecheck and tests on Node 22 and 24, installs the packed tarball and runs the CLI from it, and runs the composite GitHub Action.

## Layout

```
src/
  cli.ts            argument parsing and exit codes; I/O is injected so it is tested without a process
  init.ts           builds a config draft from the current output (the init command)
  index.ts          public API — anything not exported here is internal
  config.ts         config lookup, reading and validation (external input is narrowed from unknown only here)
  run.ts            check selection and execution; one check throwing never blocks the others
  report.ts         text and JSON output
  plist.ts          keeps the @expo/plist CJS interop in one place
  types.ts          shared types such as CheckResult and Result
  checks/
    index.ts        check registry
    types.ts        the Check interface
    ios-plist.ts    one check per file
    android-manifest.ts  the same rules applied to the source and merged manifests (two checks)
    app-icons.ts    iOS alternate icons and Android launcher aliases (two checks)
test/
  fixtures/         a sample Expo project for CLI smoke tests
  helpers.ts        builds throwaway projects
docs/               user docs (linked from the README)
action.yml          the composite GitHub Action
```

## Adding a check

1. Implement `Check` in `src/checks/<id>.ts`. Without config, return `skip`, not `fail`.
   A check that needs an extra build step should set `runsByDefault: false` so it runs only when named.
2. Export the pure logic separately, e.g. `run<Id>(cwd, options)`, so it is easy to test.
3. Add it to the `checks` array in `src/checks/index.ts`.
4. If it needs config, extend the `Config` type and `parseConfig` in `src/config.ts`.
5. Write `test/<id>.test.ts` covering pass, fail, skip and malformed input — ideally reproducing a real incident.
6. Write `docs/checks/<id>.md` and add a line to the check tables in both READMEs.
7. If a baseline can be read from the output, teach `src/init.ts` to draft it.

## Principles

- A failure message says both *what is wrong* and *what to do*.
- With several candidates, never guess — ask for configuration.
- No `any`. External input comes in as `unknown` and is narrowed.
- User-facing text is English. Code comments may be Korean.
