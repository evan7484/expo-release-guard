import { androidManifestCheck, androidMergedManifestCheck } from "./android-manifest.js";
import { iosPlistCheck } from "./ios-plist.js";
import type { Check } from "./types.js";

/** 등록된 검사. 새 검사는 checks/<id>.ts에 만들고 여기에 한 줄 추가한다. */
export const checks: readonly Check[] = [iosPlistCheck, androidManifestCheck, androidMergedManifestCheck];

export type { Check, CheckContext } from "./types.js";
