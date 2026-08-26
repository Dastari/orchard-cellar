import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DbConnection, tables } from '../packages/client/src/net/generated/index.js';

const HOST = process.env['SPACETIMEDB_HOST'] ?? 'http://127.0.0.1:3000';
const DATABASE = process.env['SPACETIMEDB_DATABASE'] ?? 'orchard-cellar-world';
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function connect(): Promise<DbConnection> {
  return await new Promise((resolve, reject) => DbConnection.builder().withUri(HOST).withDatabaseName(DATABASE)
    .onConnect((connection) => resolve(connection))
    .onConnectError((_context, error) => reject(error)).build());
}

async function waitUntil(label: string, predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const started = performance.now();
  while (!predicate()) {
    if (performance.now() - started > timeoutMs) throw new Error(`${label}_timeout`);
    await wait(20);
  }
}

const observer = await connect();
try {
  await new Promise<void>((resolve, reject) => observer.subscriptionBuilder().onApplied(() => resolve())
    .onError((context) => reject(new Error(String(context.event))))
    .subscribe([tables.playerPosition, tables.playerPublic]));
  const script = fileURLToPath(new URL('./netcode-crash-client.ts', import.meta.url));
  // Run TypeScript in the child itself so SIGKILL terminates the process that
  // owns the websocket, rather than only terminating a CLI wrapper.
  const child = spawn(process.execPath, ['--import', 'tsx', script], {
    env: { ...process.env, SPACETIMEDB_HOST: HOST, SPACETIMEDB_DATABASE: DATABASE },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errorOutput = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { output += chunk; });
  child.stderr.on('data', (chunk: string) => { errorOutput += chunk; });
  await waitUntil('crash_client_ready', () => output.includes('CRASH_READY '), 10_000);
  const identityHex = /CRASH_READY ([0-9a-f]+)/.exec(output)?.[1];
  if (identityHex === undefined) throw new Error(`crash_identity_missing:${output}:${errorOutput}`);
  const findPosition = () => [...observer.db.playerPosition.iter()]
    .find((row) => row.identity.toHexString() === identityHex);
  await waitUntil('observer_saw_crash_client', () => findPosition()?.moving === true);
  const killedAt = performance.now();
  child.kill('SIGKILL');
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('crash_child_exit_timeout')), 2_000);
    child.once('exit', () => { clearTimeout(timeout); resolve(); });
  });
  await waitUntil('stale_input_stop', () => findPosition()?.moving === false, 2_100);
  const stoppedWithinMs = performance.now() - killedAt;
  const profile = [...observer.db.playerPublic.iter()]
    .find((row) => row.identity.toHexString() === identityHex);
  if (profile?.online !== true) throw new Error('presence_did_not_survive_transport_crash');
  const heldX = findPosition()?.x; await wait(300);
  if (heldX === undefined || findPosition()?.x !== heldX) throw new Error('crash_ghost_kept_walking');
  process.stdout.write(`${JSON.stringify({ killedProcess: true, stoppedWithinMs, presenceOnline: true })}\n`);
} finally { observer.disconnect(); }
