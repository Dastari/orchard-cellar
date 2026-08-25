export interface JwtClaims {
  readonly iss?: unknown;
  readonly aud?: unknown;
  readonly azp?: unknown;
  readonly sub?: unknown;
  readonly exp?: unknown;
  readonly nonce?: unknown;
  readonly preferred_username?: unknown;
  readonly name?: unknown;
  readonly email?: unknown;
  readonly email_verified?: unknown;
}

interface JwtHeader {
  readonly alg?: unknown;
  readonly kid?: unknown;
}

interface JsonWebKeySet {
  readonly keys?: unknown;
}

type OidcJsonWebKey = JsonWebKey & { readonly kid?: string };

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function decodeJsonPart<T>(value: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
  } catch {
    return null;
  }
}

export function decodeJwtClaims(token: string): JwtClaims | null {
  const payload = token.split('.')[1];
  return payload === undefined ? null : decodeJsonPart<JwtClaims>(payload);
}

export function tokenAudiences(claim: unknown): readonly string[] {
  if (typeof claim === 'string') return [claim];
  return Array.isArray(claim) ? claim.filter((entry): entry is string => typeof entry === 'string') : [];
}

export function validateIdTokenClaims(
  claims: JwtClaims | null,
  expectedNonce: string | undefined,
  now: number,
  issuer: string,
  clientId: string,
): void {
  if (!claims || typeof claims.iss !== 'string' || typeof claims.sub !== 'string' || typeof claims.exp !== 'number') {
    throw new Error('The account service returned an invalid identity token.');
  }
  if (claims.iss.replace(/\/$/, '') !== issuer) throw new Error('The identity token came from an unexpected issuer.');
  const audiences = tokenAudiences(claims.aud);
  if (!audiences.includes(clientId)) throw new Error('The identity token was not issued for this game.');
  if (audiences.length > 1 && claims.azp !== clientId) {
    throw new Error('The identity token authorized a different browser client.');
  }
  if (expectedNonce !== undefined && claims.nonce !== expectedNonce) throw new Error('The login response nonce did not match.');
  if (claims.exp * 1000 <= now) throw new Error('The identity token has already expired.');
}

export async function verifyIdTokenSignature(token: string, jwksUri: string): Promise<void> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] === undefined || parts[1] === undefined || parts[2] === undefined) {
    throw new Error('The account service returned an invalid identity token.');
  }
  const header = decodeJsonPart<JwtHeader>(parts[0]);
  if (header?.alg !== 'RS256' || typeof header.kid !== 'string') {
    throw new Error('The account service returned an unsupported identity token.');
  }
  const response = await fetch(jwksUri, {
    headers: { accept: 'application/json' }, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
  });
  if (!response.ok) throw new Error('The account service signing keys are unavailable.');
  const set = await response.json() as JsonWebKeySet;
  const keys = Array.isArray(set.keys) ? set.keys : [];
  const key = keys.find((candidate): candidate is OidcJsonWebKey => (
    typeof candidate === 'object' && candidate !== null
    && (candidate as OidcJsonWebKey).kid === header.kid
    && (candidate as OidcJsonWebKey).kty === 'RSA'
  ));
  if (key === undefined) throw new Error('The account service signing key was not recognized.');
  const cryptoKey = await crypto.subtle.importKey(
    'jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
  );
  const signature = decodeBase64Url(parts[2]);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signature.buffer.slice(signature.byteOffset, signature.byteOffset + signature.byteLength) as ArrayBuffer,
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) throw new Error('The account service identity token signature was invalid.');
}
