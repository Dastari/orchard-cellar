import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, request, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { preview } from 'vite';
import {
  WORLD_CHUNK_CACHE_CONTROL, acceptedEncodings, createWorldChunkMiddleware, parseWorldChunkPath, sendPlain, worldChunkRoot,
  worldChunkServing,
} from '../world-chunk-serving.js';

const HASH = 'a'.repeat(64);
const BR_ONLY = 'b'.repeat(64);
const PLAIN_ONLY = 'c'.repeat(64);
const LINKED = 'd'.repeat(64);
const FIFO = '9'.repeat(64);
const identityBytes = Buffer.from('identity-blob-bytes');
const brBytes = Buffer.from('brotli-bytes');
const gzipBytes = Buffer.from('gzip-bytes!!');

interface RawResponse { readonly status: number; readonly headers: IncomingHttpHeaders; readonly body: Buffer }

async function listen(root: string | undefined): Promise<{ server: Server; port: number }> {
  const middleware = createWorldChunkMiddleware(root);
  const server = createServer((req, res) => middleware(req, res, () => {
    // Stands in for Vite's static/SPA fallback: /world/ must never reach it.
    res.statusCode = 299;
    res.end('fell-through');
  }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, port: (server.address() as AddressInfo).port };
}

/** Drop keep-alive sockets so close() does not wait for the idle timeout. */
async function stop(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

/** node:http keeps bytes raw (fetch would transparently decode br/gzip). */
function send(port: number, path: string, options: { method?: string; headers?: Record<string, string> } = {}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: options.method ?? 'GET', headers: options.headers ?? {} }, res => {
      const parts: Buffer[] = [];
      res.on('data', (part: Buffer) => parts.push(part));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(parts) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

describe('world chunk blob serving', () => {
  let root: string;
  let port: number;
  let server: Server;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'orchard-world-chunks-'));
    await mkdir(join(root, '1'));
    await mkdir(join(root, '0'));
    await writeFile(join(root, '1', `${HASH}.bin`), identityBytes);
    await writeFile(join(root, '1', `${HASH}.bin.br`), brBytes);
    await writeFile(join(root, '1', `${HASH}.bin.gz`), gzipBytes);
    await writeFile(join(root, '1', `${BR_ONLY}.bin.br`), brBytes);
    await writeFile(join(root, '0', `${PLAIN_ONLY}.bin`), identityBytes);
    await writeFile(join(root, 'outside.bin'), 'secret');
    await symlink(join(root, 'outside.bin'), join(root, '1', `${LINKED}.bin`));
    execFileSync('mkfifo', [join(root, '1', `${FIFO}.bin`)]);
    ({ server, port } = await listen(root));
  });
  afterAll(async () => {
    await stop(server);
    await rm(root, { recursive: true, force: true });
  });

  it('accepts only the exact chunkBlobPath address', () => {
    expect(parseWorldChunkPath(`/world/1/${HASH}.bin`)).toEqual({ spaceId: '1', hash: HASH });
    expect(parseWorldChunkPath(`/world/0/${HASH}.bin`)).toEqual({ spaceId: '0', hash: HASH });
    for (const path of [
      `/world/01/${HASH}.bin`, `/world/-1/${HASH}.bin`, `/world/1/${HASH.toUpperCase()}.bin`,
      `/world/1/${HASH.slice(1)}.bin`, `/world/1/${HASH}.bin.br`, `/world/1/${HASH}.bin?v=1`,
      `/world/1/../${HASH}.bin`, `/world/1/%2e%2e/${HASH}.bin`, `/world//1/${HASH}.bin`,
      `/world/99999999999999999/${HASH}.bin`, `/world/1/${HASH}.bin/`, `/world/1/sub/${HASH}.bin`,
    ]) expect(parseWorldChunkPath(path), path).toBeNull();
  });

  it('negotiates br before gzip, honouring q-values and wildcards', () => {
    expect(acceptedEncodings('gzip, deflate, br')).toEqual(['br', 'gzip']);
    expect(acceptedEncodings('gzip;q=1, br;q=0.5')).toEqual(['gzip', 'br']);
    expect(acceptedEncodings('br;q=0, gzip')).toEqual(['gzip']);
    expect(acceptedEncodings('*')).toEqual(['br', 'gzip']);
    expect(acceptedEncodings('*;q=0.1, gzip;q=0')).toEqual(['br']);
    expect(acceptedEncodings('identity')).toEqual([]);
    expect(acceptedEncodings(undefined)).toEqual([]);
    expect(acceptedEncodings('br;q=abc')).toEqual([]);
  });

  it('serves identity bytes with immutable, content-addressed headers', async () => {
    const response = await send(port, `/world/1/${HASH}.bin`);
    expect(response.status).toBe(200);
    expect(response.body.equals(identityBytes)).toBe(true);
    expect(response.headers['content-type']).toBe('application/octet-stream');
    expect(response.headers['cache-control']).toBe(WORLD_CHUNK_CACHE_CONTROL);
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(response.headers.etag).toBe(`"${HASH}"`);
    expect(response.headers.vary).toBe('Accept-Encoding');
    expect(response.headers['content-encoding']).toBeUndefined();
    expect(response.headers['content-length']).toBe(String(identityBytes.length));
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('serves the precompressed sibling the client prefers', async () => {
    const br = await send(port, `/world/1/${HASH}.bin`, { headers: { 'accept-encoding': 'gzip, deflate, br' } });
    expect(br.status).toBe(200);
    expect(br.headers['content-encoding']).toBe('br');
    expect(br.body.equals(brBytes)).toBe(true);
    expect(br.headers['content-length']).toBe(String(brBytes.length));
    expect(br.headers.etag).toBe(`"${HASH}-br"`);
    expect(br.headers.vary).toBe('Accept-Encoding');

    const gzip = await send(port, `/world/1/${HASH}.bin`, { headers: { 'accept-encoding': 'gzip' } });
    expect(gzip.headers['content-encoding']).toBe('gzip');
    expect(gzip.body.equals(gzipBytes)).toBe(true);
    expect(gzip.headers.etag).toBe(`"${HASH}-gzip"`);
  });

  it('falls back to identity when no acceptable sibling exists', async () => {
    const response = await send(port, `/world/0/${PLAIN_ONLY}.bin`, { headers: { 'accept-encoding': 'br, gzip' } });
    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBeUndefined();
    expect(response.body.equals(identityBytes)).toBe(true);
  });

  it('answers HEAD with GET headers and no body', async () => {
    const response = await send(port, `/world/1/${HASH}.bin`, { method: 'HEAD', headers: { 'accept-encoding': 'br' } });
    expect(response.status).toBe(200);
    expect(response.body.length).toBe(0);
    expect(response.headers['content-length']).toBe(String(brBytes.length));
    expect(response.headers['content-encoding']).toBe('br');
    expect(response.headers['cache-control']).toBe(WORLD_CHUNK_CACHE_CONTROL);
  });

  it('revalidates with a 304 for a matching entity tag', async () => {
    const response = await send(port, `/world/1/${HASH}.bin`, { headers: { 'if-none-match': `W/"${HASH}"` } });
    expect(response.status).toBe(304);
    expect(response.body.length).toBe(0);
    expect(response.headers.etag).toBe(`"${HASH}"`);
  });

  it('compares If-None-Match only with the selected representation', async () => {
    const stale = await send(port, `/world/1/${HASH}.bin`, { headers: { 'if-none-match': `"${HASH}-gzip"`, 'accept-encoding': 'br' } });
    expect(stale.status).toBe(200);
    expect(stale.headers['content-encoding']).toBe('br');
    expect(stale.headers.etag).toBe(`"${HASH}-br"`);
    expect(stale.body.equals(brBytes)).toBe(true);

    const fresh = await send(port, `/world/1/${HASH}.bin`, { headers: { 'if-none-match': `"${HASH}-gzip"`, 'accept-encoding': 'gzip' } });
    expect(fresh.status).toBe(304);
    const identity = await send(port, `/world/1/${HASH}.bin`, { headers: { 'if-none-match': `"${HASH}-br"` } });
    expect(identity.status).toBe(200);
    expect(identity.body.equals(identityBytes)).toBe(true);
  });

  it('refuses a FIFO at a blob path without blocking', async () => {
    const response = await send(port, `/world/1/${FIFO}.bin`);
    expect(response.status).toBe(404);
  });

  it('strips representation headers from an error response', async () => {
    const failing = createServer((req, res) => {
      res.setHeader('Vary', 'Origin, Accept-Encoding');
      res.setHeader('ETag', `"${HASH}-br"`);
      res.setHeader('Content-Encoding', 'br');
      res.setHeader('Accept-Ranges', 'none');
      sendPlain(res, req.method, 500, 'Internal error\n');
    });
    await new Promise<void>(resolve => failing.listen(0, '127.0.0.1', resolve));
    try {
      const response = await send((failing.address() as AddressInfo).port, `/world/1/${HASH}.bin`);
      expect(response.status).toBe(500);
      expect(response.headers.etag).toBeUndefined();
      expect(response.headers['content-encoding']).toBeUndefined();
      expect(response.headers['accept-ranges']).toBeUndefined();
      expect(response.headers.vary).toBe('Origin');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body.toString()).toBe('Internal error\n');
    } finally {
      await stop(failing);
    }
  });

  it('returns a real, uncached 404 for missing blobs, siblings without a blob, and symlinks', async () => {
    for (const path of [`/world/1/${'e'.repeat(64)}.bin`, `/world/7/${HASH}.bin`, `/world/1/${BR_ONLY}.bin`, `/world/1/${LINKED}.bin`]) {
      const response = await send(port, path, { headers: { 'accept-encoding': 'br' } });
      expect(response.status, path).toBe(404);
      expect(response.headers['cache-control'], path).toBe('no-store');
      expect(response.body.toString(), path).toBe('Not found\n');
    }
  });

  it('never falls through to the SPA fallback for malformed or traversal paths', async () => {
    for (const path of [
      '/world/', '/world/1', `/world/1/${HASH}.bin.br`, `/world/1/${HASH}.bin?cache=1`, '/world/1/../../etc/passwd',
      '/world/%2e%2e/%2e%2e/etc/passwd', '/world/..%2f..%2fetc%2fpasswd', `/world/1/..%2f${HASH}.bin`, '/world/index.html',
      '/world/1/outside.bin', '/world/../outside.bin',
    ]) {
      const response = await send(port, path);
      expect(response.status, path).toBe(404);
      expect(response.body.toString(), path).toBe('Not found\n');
    }
  });

  it('rejects other methods with 405 and an Allow header', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      const response = await send(port, `/world/1/${HASH}.bin`, { method });
      expect(response.status, method).toBe(405);
      expect(response.headers.allow, method).toBe('GET, HEAD');
    }
  });

  it('keeps a Vary field set by earlier middleware', async () => {
    const middleware = createWorldChunkMiddleware(root);
    const withCors = createServer((req, res) => {
      res.setHeader('Vary', 'Origin');
      middleware(req, res, () => res.end());
    });
    await new Promise<void>(resolve => withCors.listen(0, '127.0.0.1', resolve));
    try {
      const response = await send((withCors.address() as AddressInfo).port, `/world/1/${HASH}.bin`);
      expect(response.headers.vary).toBe('Origin, Accept-Encoding');
    } finally {
      await stop(withCors);
    }
  });

  it('passes every other path to the next middleware', async () => {
    for (const path of ['/', '/world', '/worlds/1', '/assets/index.js']) {
      expect((await send(port, path)).status, path).toBe(299);
    }
  });

  it('answers 404 for every blob when no chunk directory is configured', async () => {
    const disabled = await listen(undefined);
    try {
      const response = await send(disabled.port, `/world/1/${HASH}.bin`);
      expect(response.status).toBe(404);
      expect((await send(disabled.port, '/play')).status).toBe(299);
    } finally {
      await stop(disabled.server);
    }
  });

  it('requires an absolute ORCHARD_WORLD_CHUNK_DIR', () => {
    const warnings: string[] = [];
    expect(worldChunkRoot(undefined, message => warnings.push(message))).toBeUndefined();
    expect(worldChunkRoot('', message => warnings.push(message))).toBeUndefined();
    expect(worldChunkRoot(root, message => warnings.push(message))).toBe(root);
    expect(warnings).toEqual([]);
    expect(worldChunkRoot('relative/chunks', message => warnings.push(message))).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('must be absolute');
  });

  it('warns once but stays configured when the absolute directory is missing', () => {
    const warnings: string[] = [];
    const missing = join(root, 'not-created-yet');
    expect(worldChunkRoot(missing, message => warnings.push(message))).toBe(missing);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('missing or unreadable');
    expect(worldChunkRoot(join(root, 'outside.bin'), message => warnings.push(message))).toBe(join(root, 'outside.bin'));
    expect(warnings).toHaveLength(2);
  });

  it('runs ahead of Vite preview compression and SPA fallback', async () => {
    const site = await mkdtemp(join(tmpdir(), 'orchard-world-preview-'));
    await mkdir(join(site, 'dist'));
    await writeFile(join(site, 'dist', 'index.html'), '<!doctype html><title>spa</title>');
    const server = await preview({
      configFile: false, root: site, logLevel: 'silent',
      plugins: [worldChunkServing({ ORCHARD_WORLD_CHUNK_DIR: root })],
      preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false },
    });
    try {
      const previewPort = (server.httpServer.address() as AddressInfo).port;
      const blob = await send(previewPort, `/world/0/${PLAIN_ONLY}.bin`, { headers: { 'accept-encoding': 'gzip, br' } });
      expect(blob.status).toBe(200);
      expect(blob.headers['content-encoding']).toBeUndefined();
      expect(blob.body.equals(identityBytes)).toBe(true);
      expect(blob.headers['cache-control']).toBe(WORLD_CHUNK_CACHE_CONTROL);
      const missing = await send(previewPort, `/world/1/${'e'.repeat(64)}.bin`, { headers: { accept: 'text/html' } });
      expect(missing.status).toBe(404);
      expect(missing.body.toString()).toBe('Not found\n');
      const spa = await send(previewPort, '/play', { headers: { accept: 'text/html' } });
      expect(spa.status).toBe(200);
      expect(spa.body.toString()).toContain('<title>spa</title>');
    } finally {
      await server.close();
      await rm(site, { recursive: true, force: true });
    }
  });
});
