export class CtxpackError extends Error {
  constructor(code, message, meta = {}) {
    super(message);
    this.name = 'CtxpackError';
    this.code = code;
    this.meta = meta;
  }
}

export const ERR = {
  SCHEMA_INVALID: 'SCHEMA_INVALID',
  MISSING_REQUIRED: 'MISSING_REQUIRED',
  INVALID_ORDER: 'INVALID_ORDER',
};
