export { defineConfig, loadConfig, parseConfig } from "./config.js";
export type { Config, IosInfoPlistConfig, RequiredKey } from "./config.js";
export { runChecks, hasFailure } from "./run.js";
export type { CheckReport, RunOptions } from "./run.js";
export { formatJson, formatText } from "./report.js";
export { checks } from "./checks/index.js";
export type { Check, CheckContext } from "./checks/index.js";
export type { CheckResult, CheckStatus, Problem, Result } from "./types.js";
