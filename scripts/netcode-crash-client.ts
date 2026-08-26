import { DbConnection, tables } from '../packages/client/src/net/generated/index.js';

const HOST = process.env['SPACETIMEDB_HOST'] ?? 'http://127.0.0.1:3000';
const DATABASE = process.env['SPACETIMEDB_DATABASE'] ?? 'orchard-cellar-world';

const client = await new Promise<{ connection: DbConnection; identityHex: string }>((resolve, reject) => {
  DbConnection.builder().withUri(HOST).withDatabaseName(DATABASE)
    .onConnect((connection, identity) => resolve({ connection, identityHex: identity.toHexString() }))
    .onConnectError((_context, error) => reject(error)).build();
});
await new Promise<void>((resolve, reject) => client.connection.subscriptionBuilder()
  .onApplied(() => resolve()).onError((context) => reject(new Error(String(context.event))))
  .subscribe(tables.playerPosition));
const row = [...client.connection.db.playerPosition.iter()]
  .find((candidate) => candidate.identity.toHexString() === client.identityHex);
if (row === undefined) throw new Error('crash_client_position_missing');
await client.connection.reducers.setInput({
  direction: 'right',
  sequence: row.lastProcessedSequence + 1n,
  clientTick: 0n,
  sprinting: false,
});
const startedX = row.x;
await new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('crash_client_move_timeout')), 5_000);
  const timer = setInterval(() => {
    const position = [...client.connection.db.playerPosition.iter()]
      .find((candidate) => candidate.identity.toHexString() === client.identityHex);
    if (position?.x === startedX) return;
    clearTimeout(timeout); clearInterval(timer); resolve();
  }, 20);
});
process.stdout.write(`CRASH_READY ${client.identityHex}\n`);
await new Promise(() => {});
