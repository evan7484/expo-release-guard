import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", cli: "src/cli.ts" },
  format: ["esm"],
  target: "node22",
  platform: "node",
  dts: { entry: { index: "src/index.ts" } },
  clean: true,
  sourcemap: true,
  // 런타임 의존성은 번들하지 않는다 — package.json dependencies가 단일 출처
  skipNodeModulesBundle: true,
});
