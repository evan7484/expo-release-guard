import plistModule from "@expo/plist";

interface PlistApi {
  parse(xml: string): unknown;
}

const hasParse = (v: unknown): v is PlistApi =>
  typeof v === "object" && v !== null && typeof (v as Partial<PlistApi>).parse === "function";

/**
 * @expo/plist는 __esModule 표시가 붙은 CJS 패키지다. Node ESM은 module.exports를 그대로
 * default로 주므로 실제 API가 `.default` 안에 한 겹 더 있고, 번들러(Vite·esbuild)의 interop은
 * 그 한 겹을 벗겨서 준다. 실행 환경마다 모양이 달라 둘 다 받아들이고, 그 사실을 이 파일에만 둔다.
 */
const api: PlistApi = (() => {
  const mod: unknown = plistModule;
  if (hasParse(mod)) return mod;
  const inner: unknown = (mod as { default?: unknown } | null)?.default;
  if (hasParse(inner)) return inner;
  throw new Error("Could not find parse() in @expo/plist.");
})();

export function parsePlist(xml: string): unknown {
  return api.parse(xml);
}
