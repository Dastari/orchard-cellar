export class WebGLWorldPassError extends Error {
  constructor(readonly reason: string, cause?: unknown) {
    super(reason, cause === undefined ? undefined : { cause }); this.name = 'WebGLWorldPassError';
  }
}
export function requireWebGL<T>(value: T | null, reason: string): T {
  if (value === null) throw new WebGLWorldPassError(reason);
  return value;
}
