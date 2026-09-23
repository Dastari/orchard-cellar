import { fileURLToPath } from 'node:url';
import {
  bootstrapContentDefinitions,
  contentDefinitionsHash,
  serializeContentDefinitionForTransport,
} from '@orchard/sim';

// Combined wave2, D6 and timing content: 921 definitions, 620,844 runtime bytes.
// Retain the measured next-whole-KiB regression envelope.
export const CONTENT_INITIAL_PAYLOAD_BUDGET_BYTES = 607 * 1024;

export interface ContentPackMeasurement {
  readonly definitionCount: number;
  readonly kindCount: number;
  readonly definitionJsonBytes: number;
  readonly rowEnvelopeJsonBytes: number;
  /** Three length-prefixed UTF-8 strings per runtime view row (BSATN), excluding protocol framing. */
  readonly runtimePayloadBytes: number;
  readonly averageRowEnvelopeBytes: number;
  readonly contentHash: string;
  readonly withinInitialPayloadBudget: boolean;
}

function bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }

/** Stable client-subscription envelope estimate. Wire compression/protocol
 * overhead is intentionally measured separately against the disposable host. */
export function measureContentPack(): ContentPackMeasurement {
  const definitions = bootstrapContentDefinitions();
  const rows = definitions.map((definition) => ({
    id: definition.id,
    kind: definition.kind,
    slug: definition.id.slice(definition.id.indexOf(':') + 1),
    revision: '1',
    hash: contentDefinitionsHash([definition]),
    json: serializeContentDefinitionForTransport(definition),
  }));
  const definitionJsonBytes = rows.reduce((sum, row) => sum + bytes(row.json), 0);
  const rowEnvelopeJsonBytes = bytes(JSON.stringify(rows));
  const runtimePayloadBytes = rows.reduce((sum, row) => sum + 12 + bytes(row.id) + bytes(row.kind) + bytes(row.json), 0);
  return Object.freeze({
    definitionCount: definitions.length,
    kindCount: new Set(definitions.map(({ kind }) => kind)).size,
    definitionJsonBytes,
    rowEnvelopeJsonBytes,
    runtimePayloadBytes,
    averageRowEnvelopeBytes: rows.length === 0 ? 0 : Math.ceil(rowEnvelopeJsonBytes / rows.length),
    contentHash: contentDefinitionsHash(definitions),
    withinInitialPayloadBudget: runtimePayloadBytes <= CONTENT_INITIAL_PAYLOAD_BUDGET_BYTES,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const measurement = measureContentPack();
  console.log(JSON.stringify(measurement, null, 2));
  if (!measurement.withinInitialPayloadBudget) process.exitCode = 1;
}
