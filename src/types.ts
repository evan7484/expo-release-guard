/** 검사 하나가 찾은 문제. `hint`에는 "왜 필요한지"를 적어 고치는 사람이 판단할 수 있게 한다. */
export interface Problem {
  readonly message: string;
  readonly hint?: string;
}

/**
 * 검사 결과.
 * - `pass`: 통과
 * - `fail`: 릴리스를 막아야 하는 문제가 있음
 * - `skip`: 설정이 없거나 이 프로젝트에 해당하지 않음 — 실패로 치지 않는다
 */
export type CheckResult =
  | { readonly status: "pass"; readonly summary: string }
  | { readonly status: "fail"; readonly summary: string; readonly problems: readonly Problem[] }
  | { readonly status: "skip"; readonly reason: string };

export type CheckStatus = CheckResult["status"];

/** 성공 또는 실패 값. 예상 가능한 실패는 throw 대신 이것으로 돌려준다. 기본 실패 값은 사람이 읽을 메시지다. */
export type Result<T, E = string> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T, E = string>(value: T): Result<T, E> => ({ ok: true, value });
export const err = <T = never, E = string>(error: E): Result<T, E> => ({ ok: false, error });
