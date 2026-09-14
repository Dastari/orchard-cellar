import {
  bootstrapContentRows,
  buildContentRegistry,
  contentDefinitionsHash,
  type SupportedContentDefinition,
} from '@orchard/sim';
import type { StoredContentDefinition } from './contracts.js';

export interface ContentSeedPlan {
  readonly contentHash: string;
  readonly definitions: readonly StoredContentDefinition[];
  readonly changeSetJson: string;
  readonly inverseChangeSetJson: string;
}

export function bootstrapContentSeedPlan(): ContentSeedPlan {
  const rows = bootstrapContentRows();
  const built = buildContentRegistry(rows);
  if (!built.report.valid) throw new Error('bootstrap_content_invalid');
  const definitions = [...built.registry.definitions.values()].map((definition): StoredContentDefinition => ({
    id: definition.id,
    kind: definition.kind,
    slug: definition.id.slice(definition.id.indexOf(':') + 1),
    revision: 1n,
    hash: contentDefinitionsHash([definition as SupportedContentDefinition]),
    json: JSON.stringify(definition),
  }));
  return Object.freeze({
    contentHash: built.registry.contentHash,
    definitions: Object.freeze(definitions),
    changeSetJson: JSON.stringify({
      upserts: definitions.map(({ id, kind, json }) => ({ id, kind, json })),
      deletes: [],
    }),
    inverseChangeSetJson: JSON.stringify({ upserts: [], deletes: definitions.map(({ id }) => id) }),
  });
}

