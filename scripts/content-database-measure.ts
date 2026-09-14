import { buildContentRegistry, type ContentDefinitionRow } from '@orchard/sim';
import { DbConnection, tables } from '@orchard/world-bindings';
import {
  CONTENT_LOAD_OBSERVERS, CONTENT_LOAD_ROWS, CONTENT_TRANSACTION_BUDGET_MS,
  INITIAL_SUBSCRIPTION_BUDGET_BYTES, MODULE_REGISTRY_BUDGET_MS,
  measurementDefinitions, requireDisposableMeasurementTarget, resetWireCounter,
  summarizeSamples, type WireCounter,
} from './content-load-acceptance.js';

const HOST = process.env['SPACETIMEDB_HOST'] ?? 'http://127.0.0.1:3400';
const DATABASE = process.env['SPACETIMEDB_DATABASE'] ?? 'orchard-content-measure-local01';
const TIMEOUT_MS = 90_000;
const REGISTRY_SAMPLES = 25;
requireDisposableMeasurementTarget(HOST, DATABASE);
const originalConsoleInfo = console.info;
console.info = () => undefined;

interface SocketArgs {
  readonly url: URL; readonly wsProtocol: string[]; readonly nameOrAddress: string;
  readonly authToken?: string; readonly compression: 'gzip' | 'brotli' | 'none';
  readonly lightMode: boolean; readonly confirmedReads?: boolean;
}

class CountingSocketAdapter {
  readonly #socket: WebSocket;
  constructor(args: SocketArgs, private readonly counter: WireCounter) {
    if (args.authToken !== undefined) throw new Error('content_measure_uses_disposable_anonymous_identity');
    const databaseUrl = new URL(`v1/database/${args.nameOrAddress}/subscribe`, args.url);
    databaseUrl.searchParams.set('compression', 'None');
    if (args.lightMode) databaseUrl.searchParams.set('light', 'true');
    if (args.confirmedReads !== undefined) databaseUrl.searchParams.set('confirmed', String(args.confirmedReads));
    this.#socket = new WebSocket(databaseUrl, args.wsProtocol);
    this.#socket.binaryType = 'arraybuffer';
  }
  get protocol(): string { return this.#socket.protocol; }
  get readyState(): number { return this.#socket.readyState; }
  send(message: Uint8Array<ArrayBuffer>): void { this.counter.outbound += message.byteLength; this.#socket.send(message); }
  close(): void { this.#socket.close(); }
  set onclose(handler: (event: CloseEvent) => void) { this.#socket.onclose = handler; }
  set onopen(handler: () => void) { this.#socket.onopen = () => handler(); }
  set onerror(handler: (event: ErrorEvent) => void) { this.#socket.onerror = handler as (event: Event) => void; }
  set onmessage(handler: (message: { data: Uint8Array }) => void) {
    this.#socket.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer)) throw new Error('content_measure_expected_binary_frame');
      const data = new Uint8Array(event.data);
      this.counter.inbound += data.byteLength;
      if (data[0] !== 0) throw new Error('content_measure_expected_uncompressed_frame');
      handler({ data: data.subarray(1) });
    };
  }
}

function timeout<T>(label: string, promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), TIMEOUT_MS);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error: unknown) => { clearTimeout(timer); reject(error); });
  });
}

interface ReducerMetric { readonly count: number; readonly sumSeconds: number }
async function reducerMetric(): Promise<ReducerMetric> {
  const identityResponse = await fetch(`${HOST}/v1/database/${DATABASE}/identity`);
  if (!identityResponse.ok) throw new Error(`database_identity_failed:${identityResponse.status}`);
  const databaseIdentity = (await identityResponse.text()).trim();
  const metricsResponse = await fetch(`${HOST}/v1/metrics`);
  if (!metricsResponse.ok) throw new Error(`database_metrics_failed:${metricsResponse.status}`);
  const metrics = await metricsResponse.text();
  let count = 0; let sumSeconds = 0;
  for (const line of metrics.split('\n')) {
    const countMatch = /^spacetime_reducer_plus_query_duration_sec_count\{db="([^"]+)",reducer="publish_content_change_set"\} ([\d.eE+-]+)$/u.exec(line);
    if (countMatch?.[1] === databaseIdentity) count = Number(countMatch[2]);
    const sumMatch = /^spacetime_reducer_plus_query_duration_sec_sum\{db="([^"]+)",reducer="publish_content_change_set"\} ([\d.eE+-]+)$/u.exec(line);
    if (sumMatch?.[1] === databaseIdentity) sumSeconds = Number(sumMatch[2]);
  }
  return { count, sumSeconds };
}

async function connect(counter: WireCounter): Promise<DbConnection> {
  return timeout('connect', new Promise<DbConnection>((resolve, reject) => {
    DbConnection.builder().withUri(HOST).withDatabaseName(DATABASE).withCompression('none')
      .withWSFn(async (args) => new CountingSocketAdapter(args, counter))
      .onConnect((connected) => resolve(connected))
      .onConnectError((_context, error) => reject(error)).build();
  }));
}

async function subscribeContent(connection: DbConnection): Promise<void> {
  await timeout('content_subscription', new Promise<void>((resolve, reject) => {
    connection.subscriptionBuilder().onApplied(() => resolve())
      .onError((context) => reject(new Error(String(context.event))))
      .subscribe([tables.contentHead.where((row) => row.packId.eq('live')), tables.contentDefinition]);
  }));
}

function registryRows(connection: DbConnection): readonly ContentDefinitionRow[] {
  return [...connection.db.contentDefinition.iter()].map((row) => ({ id: row.id, kind: row.kind, json: row.json }));
}

const publisherCounter: WireCounter = { inbound: 0, outbound: 0 };
const observerCounters = Array.from({ length: CONTENT_LOAD_OBSERVERS }, (): WireCounter => ({ inbound: 0, outbound: 0 }));
const publisher = await connect(publisherCounter);
const observers = await Promise.all(observerCounters.map((counter) => connect(counter)));

try {
  await subscribeContent(publisher);
  resetWireCounter(publisherCounter);
  await Promise.all(observers.map(async (connection, index) => {
    resetWireCounter(observerCounters[index] as WireCounter);
    await subscribeContent(connection);
  }));

  const initialInboundBytes = observerCounters.map(({ inbound }) => inbound);
  const initialOutboundBytes = observerCounters.map(({ outbound }) => outbound);
  const initialDefinitionCount = [...publisher.db.contentDefinition.iter()].length;
  const head = publisher.db.contentHead.packId.find('live');
  if (head === null) throw new Error('content_measure_head_missing');
  if (initialInboundBytes.some((bytes) => bytes > INITIAL_SUBSCRIPTION_BUDGET_BYTES)) throw new Error('content_measure_initial_subscription_budget_exceeded');

  const expectedRevision = head.revision + 1n;
  const expectedDefinitionCount = initialDefinitionCount + CONTENT_LOAD_ROWS;
  const observerAdvances = Array.from({ length: CONTENT_LOAD_OBSERVERS }, () => 0);
  const observerAtomicCounts = Array.from({ length: CONTENT_LOAD_OBSERVERS }, () => 0);
  let resolveObserved!: () => void;
  const observed = new Promise<void>((resolve) => { resolveObserved = resolve; });
  observers.forEach((connection, index) => {
    connection.db.contentHead.onUpdate((_context, oldRow, newRow) => {
      if (oldRow.packId !== 'live' || newRow.revision !== expectedRevision) return;
      observerAdvances[index] = (observerAdvances[index] ?? 0) + 1;
      queueMicrotask(() => {
        observerAtomicCounts[index] = [...connection.db.contentDefinition.iter()].length;
        if (observerAtomicCounts.every((count) => count === expectedDefinitionCount)) resolveObserved();
      });
    });
  });

  observerCounters.forEach(resetWireCounter);
  resetWireCounter(publisherCounter);
  const beforeMetric = await reducerMetric();
  const definitions = measurementDefinitions();
  const started = performance.now();
  await timeout('publish_1000', publisher.reducers.publishContentChangeSet({
    packId: 'live', expectedRevision: head.revision,
    clientMutationId: `content.measure.${Date.now()}`,
    upserts: JSON.stringify(definitions), deletes: '[]',
    note: 'Disposable 1,000-definition load acceptance measurement',
  }));
  const roundTripMs = performance.now() - started;
  await timeout('twenty_observers_atomic_head_advance', observed);
  const afterMetric = await reducerMetric();
  const serverSamples = afterMetric.count - beforeMetric.count;
  if (serverSamples !== 1) throw new Error(`content_measure_expected_one_server_sample:${serverSamples}`);
  const serverTransactionMs = (afterMetric.sumSeconds - beforeMetric.sumSeconds) * 1_000;
  if (serverTransactionMs > CONTENT_TRANSACTION_BUDGET_MS) throw new Error('content_measure_transaction_budget_exceeded');
  if (observerAdvances.some((count) => count !== 1)) throw new Error('content_measure_non_atomic_head_advance');

  const rows = registryRows(publisher);
  buildContentRegistry(rows);
  const registrySamples = Array.from({ length: REGISTRY_SAMPLES }, () => {
    const registryStarted = performance.now();
    const result = buildContentRegistry(rows);
    const duration = performance.now() - registryStarted;
    if (!result.report.valid) throw new Error(`content_measure_registry_invalid:${result.report.errors.length}`);
    return duration;
  });
  const moduleRegistryBuildMs = summarizeSamples(registrySamples);
  if (moduleRegistryBuildMs.p95 > MODULE_REGISTRY_BUDGET_MS) throw new Error('content_measure_module_registry_budget_exceeded');

  const finalHead = publisher.db.contentHead.packId.find('live');
  const finalDefinitionCount = rows.length;
  if (finalHead?.revision !== expectedRevision || finalDefinitionCount !== expectedDefinitionCount) throw new Error('content_measure_final_state_mismatch');

  console.info = originalConsoleInfo;
  console.log(JSON.stringify({
    schemaVersion: 1,
    safety: { host: HOST, database: DATABASE, loopbackOnly: true, disposableDatabase: true, anonymousAuthOnlyInTemporaryModuleCopy: true },
    compression: 'none',
    budgets: { definitions: CONTENT_LOAD_ROWS, observers: CONTENT_LOAD_OBSERVERS, serverTransactionMs: CONTENT_TRANSACTION_BUDGET_MS, moduleRegistryP95Ms: MODULE_REGISTRY_BUDGET_MS, initialSubscriptionBytesPerClient: INITIAL_SUBSCRIPTION_BUDGET_BYTES },
    initial: { definitionCount: initialDefinitionCount, inboundFramePayloadBytesPerClient: summarizeSamples(initialInboundBytes), outboundFramePayloadBytesPerClient: summarizeSamples(initialOutboundBytes) },
    publish: { rows: definitions.length, expectedRevision: head.revision.toString(), finalRevision: finalHead.revision.toString(), roundTripMs: Math.round(roundTripMs * 100) / 100, serverTransactionMs: Math.round(serverTransactionMs * 100) / 100, publisherInboundFramePayloadBytes: publisherCounter.inbound, publisherOutboundFramePayloadBytes: publisherCounter.outbound },
    observers: { connected: observers.length, headAdvancesPerClient: observerAdvances, atomicDefinitionCounts: observerAtomicCounts, inboundUpdateFramePayloadBytesPerClient: summarizeSamples(observerCounters.map(({ inbound }) => inbound)), outboundUpdateFramePayloadBytesPerClient: summarizeSamples(observerCounters.map(({ outbound }) => outbound)), reloadsOrReconnects: 0 },
    finalDefinitionCount,
    moduleRegistryBuildMs,
  }, null, 2));
} finally {
  console.info = originalConsoleInfo;
  publisher.disconnect();
  observers.forEach((connection) => connection.disconnect());
}
