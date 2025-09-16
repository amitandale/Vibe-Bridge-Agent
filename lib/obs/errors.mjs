/**
 * lib/obs/errors.mjs
 * Normalized error helpers.
 */

export const Codes = {
  ERR_JWT_INVALID: "ERR_JWT_INVALID",
  ERR_JWT_SCOPE: "ERR_JWT_SCOPE",
  ERR_PROJECT_DISABLED: "ERR_PROJECT_DISABLED",
  ERR_REPLAY: "ERR_REPLAY",
  ERR_DB_UNAVAILABLE: "ERR_DB_UNAVAILABLE",
  ERR_BAD_INPUT: "ERR_BAD_INPUT",
  ERR_INTERNAL: "ERR_INTERNAL",
};

export function httpError(code, message, status = 500, details = undefined) {
  return {
    status,
    body: { error: { code, message, ...(details ? { details } : {}) } },
  };
}

export function toResponse(res, err) {
  res.statusCode = err.status || 500;
  res.setHeader?.("content-type", "application/json; charset=utf-8");
  res.end?.(JSON.stringify(err.body));
  return err;
}