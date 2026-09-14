import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');

describe('quest log live content authority', () => {
  it('resolves subscribed quest rows through the active registry', () => {
    const body = source.slice(source.indexOf('function questLogEntries('),
      source.indexOf('function questMarkerForNpc('));
    expect(body).toContain('runtimeQuestDefinition(snapshot.content.registry, row.questId)');
    expect(body).not.toContain('questDefinition(row.questId)');
  });
});
