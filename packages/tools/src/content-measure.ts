import { fileURLToPath } from 'node:url';
import { bootstrapContentDefinitions, contentDefinitionsHash } from '@orchard/sim';

export const CONTENT_INITIAL_PAYLOAD_BUDGET_BYTES = 500 * 1024;

export interface ContentPackMeasurement {
  readonly definitionCount: number;
  readonly kindCount: number;
  readonly definitionJsonBytes: number;
  readonly rowEnvelopeJsonBytes: number;
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
    json: JSON.stringify(definition),
  }));
  const definitionJsonBytes = definitions.reduce((sum, definition) => sum + bytes(JSON.stringify(definition)), 0);
  const rowEnvelopeJsonBytes = bytes(JSON.stringify(rows));
  return Object.freeze({
    definitionCount: definitions.length,
    kindCount: new Set(definitions.map(({ kind }) => kind)).size,
    definitionJsonBytes,
    rowEnvelopeJsonBytes,
    averageRowEnvelopeBytes: rows.length === 0 ? 0 : Math.ceil(rowEnvelopeJsonBytes / rows.length),
    contentHash: contentDefinitionsHash(definitions),
    withinInitialPayloadBudget: rowEnvelopeJsonBytes <= CONTENT_INITIAL_PAYLOAD_BUDGET_BYTES,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const measurement = measureContentPack();
  console.log(JSON.stringify(measurement, null, 2));
  if (!measurement.withinInitialPayloadBudget) process.exitCode = 1;
}
