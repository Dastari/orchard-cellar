import { ADMIN_MUTATION_ID_PATTERN, type AdminErrorCode } from './contracts.js';

export const CLIENT_ERROR_MESSAGE_MAX = 512;
export const CLIENT_ERROR_STACK_MAX = 2_048;
export const CLIENT_ERROR_ROUTE_MAX = 160;
export const CLIENT_ERROR_BUILD_ID_MAX = 96;
export const CLIENT_ERROR_RATE_LIMIT = 6;
export const CLIENT_ERROR_RATE_WINDOW_MICROS = 60_000_000n;
export const CLIENT_ERROR_RETENTION_MICROS = 14n * 24n * 60n * 60n * 1_000_000n;

export const CLIENT_ERROR_KINDS = ['error', 'unhandled_rejection', 'connection', 'content'] as const;
export type ClientErrorKind = typeof CLIENT_ERROR_KINDS[number];

export interface ClientErrorMutation {
  readonly clientMutationId: string;
  readonly kind: string;
  readonly message: string;
  readonly stack: string;
  readonly route: string;
  readonly buildId: string;
  readonly fingerprint: string;
  readonly observedAtMs: number;
}

export interface ClientErrorRateRow {
  readonly clientMutationId: string;
  readonly fingerprint: string;
  readonly occurredAtMicros: bigint;
}

export interface ClientErrorInsertPlan {
  readonly clientMutationId: string;
  readonly kind: ClientErrorKind;
  readonly message: string;
  readonly stack: string;
  readonly route: string;
  readonly buildId: string;
  readonly fingerprint: string;
  readonly clientObservedAtMs: bigint;
  readonly occurredAtMicros: bigint;
}

export class ClientErrorReportError extends Error {
  constructor(readonly code: AdminErrorCode) { super(code); this.name = 'ClientErrorReportError'; }
}

function fail(code: AdminErrorCode): never { throw new ClientErrorReportError(code); }

const FORBIDDEN_SECRET = /(?:\bBearer\s+|\b(?:access|refresh|id)[_-]?token\b\s*[:=]|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.)/iu;
const FINGERPRINT_PATTERN = /^[a-f0-9]{8,64}$/u;

function boundedText(value: string, maximum: number, allowEmpty = false): string {
  // eslint-disable-next-line no-control-regex -- the authority intentionally strips every forbidden C0 byte.
  const normalized = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '').trim();
  if ((!allowEmpty && normalized.length === 0) || normalized.length > maximum || FORBIDDEN_SECRET.test(normalized)) {
    return fail('admin_payload_invalid');
  }
  return normalized;
}

export function planClientErrorReport(
  mutation: ClientErrorMutation,
  recent: readonly ClientErrorRateRow[],
  nowMicros: bigint,
): ClientErrorInsertPlan | null {
  if (!ADMIN_MUTATION_ID_PATTERN.test(mutation.clientMutationId)) fail('admin_invalid_mutation_id');
  if (!(CLIENT_ERROR_KINDS as readonly string[]).includes(mutation.kind)) fail('admin_payload_invalid');
  if (!FINGERPRINT_PATTERN.test(mutation.fingerprint)) fail('admin_payload_invalid');
  if (!Number.isSafeInteger(mutation.observedAtMs) || mutation.observedAtMs < 0) fail('admin_payload_invalid');
  if (recent.some(({ clientMutationId }) => clientMutationId === mutation.clientMutationId)) return null;
  const windowStart = nowMicros - CLIENT_ERROR_RATE_WINDOW_MICROS;
  if (recent.filter(({ occurredAtMicros }) => occurredAtMicros >= windowStart).length >= CLIENT_ERROR_RATE_LIMIT) {
    fail('admin_rate_limited');
  }
  const message = boundedText(mutation.message, CLIENT_ERROR_MESSAGE_MAX);
  const stack = boundedText(mutation.stack, CLIENT_ERROR_STACK_MAX, true);
  const route = boundedText(mutation.route, CLIENT_ERROR_ROUTE_MAX);
  if (!route.startsWith('/') || route.includes('?') || route.includes('#')) fail('admin_payload_invalid');
  const buildId = boundedText(mutation.buildId, CLIENT_ERROR_BUILD_ID_MAX);
  return Object.freeze({
    clientMutationId: mutation.clientMutationId,
    kind: mutation.kind as ClientErrorKind,
    message,
    stack,
    route,
    buildId,
    fingerprint: mutation.fingerprint,
    clientObservedAtMs: BigInt(mutation.observedAtMs),
    occurredAtMicros: nowMicros,
  });
}

export function clientErrorExpired(occurredAtMicros: bigint, nowMicros: bigint): boolean {
  return nowMicros - occurredAtMicros >= CLIENT_ERROR_RETENTION_MICROS;
}
