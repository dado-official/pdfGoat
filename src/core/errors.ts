// Errors the user can cause. They carry a code instead of a text, so the UI can translate them.

export type ErrorCode =
  | 'encrypted'
  | 'passwordRequired'
  | 'passwordWrong'
  | 'notPdf'
  | 'tooLarge'
  | 'fileUnreadable'
  | 'pageMissing'
  | 'renderFailed'
  | 'rangeInvalid'
  | 'rangeOutOfBounds'
  | 'rangeEmpty'
  | 'noPages'
  | 'sourceMissing';

export type ErrorParams = Record<string, string | number>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly params: ErrorParams;

  constructor(code: ErrorCode, params: ErrorParams = {}) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.params = params;
  }
}
