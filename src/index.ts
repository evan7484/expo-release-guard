export { defineConfig, loadConfig, normalizePermission, parseConfig } from "./config.js";
export type {
  AndroidLauncherAliasesConfig,
  AndroidPermissionsConfig,
  Config,
  ForbiddenPermissionRule,
  IosAlternateIconsConfig,
  IosInfoPlistConfig,
  PermissionRule,
  RequiredKey,
} from "./config.js";
export { runChecks, hasFailure } from "./run.js";
export type { CheckReport, RunOptions } from "./run.js";
export { formatJson, formatText } from "./report.js";
export { checks } from "./checks/index.js";
export type { Check, CheckContext } from "./checks/index.js";
export type { CheckResult, CheckStatus, Problem, Result } from "./types.js";
export { buildInitialConfig, TODO_REASON } from "./init.js";
export type { InitDraft } from "./init.js";
