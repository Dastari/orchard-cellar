import { constants, createReadStream, type ReadStream } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isAbsolute, join } from 'node:path';
import type { Plugin } from 'vite';

/** Only the exact address produced by chunkBlobPath (packages/sim/src/chunk-runtime.ts). */
const WORLD_CHUNK_ROUTE = /^\/world\/(0|[1-9][0-9]{0,15})\/([a-f0-9]{64})\.bin$/u;
export const WORLD_CHUNK_PREFIX = '/world/';
export const WORLD_CHUNK_CACHE_CONTROL = 'public, max-age=31536000, immutable';

type Encoding = 'br' | 'gzip';
const SIBLINGS: readonly { readonly encoding: Encoding; readonly suffix: string }[] = [
  { encoding: 'br', suffix: '.br' },
  { encoding: 'gzip', suffix: '.gz' },
];

export interface WorldChunkAddress { readonly spaceId: string; readonly hash: string }

/** Parse the raw request target. Nothing is decoded, so encoded traversal cannot match. */
export function parseWorldChunkPath(url: string): WorldChunkAddress | null {
  const match = WORLD_CHUNK_ROUTE.exec(url);
  if (!match || !Number.isSafeInteger(Number(match[1]))) return null;
  return { spaceId: match[1]!, hash: match[2]! };
}

/** Quality per coding from Accept-Encoding; `*` covers codings not named explicitly. */
export function acceptedEncodings(header: string | string[] | undefined): Encoding[] {
  const value = Array.isArray(header) ? header.join(',') : header ?? '';
  const quality = new Map<string, number>();
  for (const part of value.split(',')) {
    const [rawName, ...params] = part.split(';');
    const name = rawName?.trim().toLowerCase();
    if (!name) continue;
    let q = 1;
    for (const param of params) {
      const [key, raw] = param.split('=');
      if (key?.trim().toLowerCase() === 'q') {
        const parsed = Number(raw?.trim());
        q = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0;
      }
    }
    quality.set(name, q);
  }
  const qualityOf = (name: string): number => quality.get(name) ?? quality.get('*') ?? 0;
  // Stable sort keeps br ahead of gzip on equal quality.
  return SIBLINGS.map(sibling => sibling.encoding)
    .filter(encoding => qualityOf(encoding) > 0)
    .sort((a, b) => qualityOf(b) - qualityOf(a));
}

function etagFor(hash: string, encoding: Encoding | null): string {
  return encoding === null ? `"${hash}"` : `"${hash}-${encoding}"`;
}

function notModified(header: string | undefined, hash: string): boolean {
  if (header === undefined) return false;
  const tags = header.split(',').map(tag => tag.trim().replace(/^W\//u, ''));
  if (tags.includes('*')) return true;
  return [null, ...SIBLINGS.map(sibling => sibling.encoding)].some(encoding => tags.includes(etagFor(hash, encoding)));
}

function plain(res: ServerResponse, method: string | undefined, status: number, body: string, extra: Record<string, string> = {}): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [name, value] of Object.entries(extra)) res.setHeader(name, value);
  res.setHeader('Content-Length', String(Buffer.byteLength(body)));
  res.end(method === 'HEAD' ? undefined : body);
}

/** Keep any Vary set by earlier middleware (Vite's CORS adds `Origin`). */
function appendVary(res: ServerResponse, field: string): void {
  const current = res.getHeader('Vary');
  const fields = (Array.isArray(current) ? current.join(',') : String(current ?? ''))
    .split(',').map(item => item.trim()).filter(Boolean);
  if (!fields.some(item => item === '*' || item.toLowerCase() === field.toLowerCase())) fields.push(field);
  res.setHeader('Vary', fields.join(', '));
}

/** Regular files only; a symlinked blob is treated as missing. */
async function openRegular(path: string): Promise<{ handle: FileHandle; size: number } | null> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile()) { await handle.close(); return null; }
    return { handle, size: stat.size };
  } catch {
    await handle?.close().catch(() => undefined);
    return null;
  }
}

export type WorldChunkMiddleware = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void;

/**
 * Serve content-addressed world chunk blobs from a persistent directory laid
 * out as `<root>/<spaceId>/<hash>.bin`, with optional precompressed
 * `<hash>.bin.br` / `<hash>.bin.gz` siblings. Every `/world/` request is
 * answered here: no SPA fallback, no fall-through to the dist directory. With
 * no root configured every blob is a 404.
 */
export function createWorldChunkMiddleware(root: string | undefined): WorldChunkMiddleware {
  return (req, res, next) => {
    const url = req.url ?? '';
    if (!url.startsWith(WORLD_CHUNK_PREFIX)) { next(); return; }
    const method = req.method;
    if (method !== 'GET' && method !== 'HEAD') {
      plain(res, method, 405, 'Method not allowed\n', { Allow: 'GET, HEAD' });
      return;
    }
    const address = parseWorldChunkPath(url);
    if (address === null || root === undefined) { plain(res, method, 404, 'Not found\n'); return; }
    void serveBlob(root, address, req, res).catch((error: unknown) => {
      if (res.headersSent) res.destroy(error instanceof Error ? error : undefined);
      else plain(res, method, 500, 'Internal error\n');
    });
  };
}

async function serveBlob(root: string, address: WorldChunkAddress, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const base = join(root, address.spaceId, `${address.hash}.bin`);
  // The identity blob is canonical: siblings never make a missing blob exist.
  const identity = await openRegular(base);
  if (identity === null) { plain(res, req.method, 404, 'Not found\n'); return; }
  let chosen = identity;
  let encoding: Encoding | null = null;
  for (const accepted of acceptedEncodings(req.headers['accept-encoding'])) {
    const sibling = await openRegular(base + SIBLINGS.find(entry => entry.encoding === accepted)!.suffix);
    if (sibling !== null) { chosen = sibling; encoding = accepted; break; }
  }
  if (chosen !== identity) await identity.handle.close();

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', WORLD_CHUNK_CACHE_CONTROL);
  appendVary(res, 'Accept-Encoding');
  res.setHeader('ETag', etagFor(address.hash, encoding));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Accept-Ranges', 'none');
  if (encoding !== null) res.setHeader('Content-Encoding', encoding);
  if (notModified(req.headers['if-none-match'], address.hash)) {
    await chosen.handle.close();
    res.statusCode = 304;
    res.end();
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Length', String(chosen.size));
  if (req.method === 'HEAD') { await chosen.handle.close(); res.end(); return; }
  const stream: ReadStream = createReadStream('', { fd: chosen.handle, autoClose: true });
  stream.on('error', error => res.destroy(error));
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

/** Resolve ORCHARD_WORLD_CHUNK_DIR; unset, empty or relative disables serving (404s). */
export function worldChunkRoot(value: string | undefined, warn: (message: string) => void): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (!isAbsolute(value)) {
    warn(`ORCHARD_WORLD_CHUNK_DIR must be absolute; /world/ blobs are disabled (got ${JSON.stringify(value)}).`);
    return undefined;
  }
  return value;
}

/** Registered before Vite's own middleware in both preview and dev servers. */
export function worldChunkServing(env: NodeJS.ProcessEnv = process.env): Plugin {
  return {
    name: 'orchard-world-chunk-serving',
    configurePreviewServer(server) {
      server.middlewares.use(createWorldChunkMiddleware(
        worldChunkRoot(env['ORCHARD_WORLD_CHUNK_DIR'], message => server.config.logger.warn(message))));
    },
    configureServer(server) {
      server.middlewares.use(createWorldChunkMiddleware(
        worldChunkRoot(env['ORCHARD_WORLD_CHUNK_DIR'], message => server.config.logger.warn(message))));
    },
  };
}
