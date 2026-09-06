import { AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS } from '@orchard/lifecycle-authoring/generated';
import { bootstrapContentRows, buildContentRegistry, createHandlerRegistry } from '@orchard/sim';
import { describe, expect, it } from 'vitest';

import type { CachedContentRegistry } from './cache.js';
import {
  invalidateObjectGraphRegistryCache,
  objectGraphRegistryForContent,
} from './object-runtime.js';

describe('runtime item callback ownership', () => {
  it('does not register a data-graph callback for a code-owned item event lane', () => {
    invalidateObjectGraphRegistryCache();
    const built = buildContentRegistry(bootstrapContentRows());
    expect(built.report.valid).toBe(true);
    const content: CachedContentRegistry = {
      key: 'single-item-callback-owner',
      revision: 10n,
      contentHash: built.registry.contentHash,
      registry: built.registry,
    };
    const code = createHandlerRegistry(AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS);
    const runtime = objectGraphRegistryForContent(code, content, 1);
    for (const registration of code.registrations) {
      if (registration.source !== 'selectedItem' || registration.match.kind !== 'definition') continue;
      const definitionId = registration.match.definitionId;
      const eventType = registration.eventType;
      const duplicateDataGraphs = runtime.registrations.filter((candidate) => (
        candidate.source === 'selectedItem'
        && candidate.match.kind === 'definition'
        && candidate.match.definitionId === definitionId
        && candidate.eventType === eventType
        && candidate.id.includes('.data_graph.')
      ));
      expect(duplicateDataGraphs, `${definitionId}:${eventType}`)
        .toEqual([]);
    }
  });
});
