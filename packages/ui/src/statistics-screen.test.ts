import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, bootstrapContentRows, buildContentRegistry, playerStatisticDefinition } from '@orchard/sim';
import {
  formatPlayerStatisticValue,
  playerStatisticSubjectLabel,
  statisticsScreenLayout,
  visiblePlayerStatisticRows,
} from './statistics-screen.js';

describe('statistics screen', () => {
  it('sorts collected, non-reserved statistics into stable categories', () => {
    const rows = visiblePlayerStatisticRows({ statistics: [
      { statisticKind: 'damage_taken', subjectKind: 'fire', value: 4n },
      { statisticKind: 'crops_harvested', subjectKind: 'strawberry', value: 6n },
      { statisticKind: 'time_played', subjectKind: '', value: 400n },
      { statisticKind: 'messages_sent', subjectKind: 'say', value: 2n },
    ] });
    expect(rows.map((row) => row.statisticKind)).toEqual([
      'time_played', 'messages_sent', 'crops_harvested',
    ]);
  });

  it('formats each specialised statistic unit for players', () => {
    expect(formatPlayerStatisticValue(1_220n, playerStatisticDefinition('time_played')!)).toBe('1M 1S');
    expect(formatPlayerStatisticValue(12_345n, playerStatisticDefinition('bronze_earned')!)).toBe('1G 23S 45B');
    expect(formatPlayerStatisticValue(768n, playerStatisticDefinition('distance_travelled')!)).toBe('3 TILES');
    expect(formatPlayerStatisticValue(12_345n, playerStatisticDefinition('items_obtained')!)).toBe('12,345');
  });

  it('uses item display names for subject labels and reserves a scrollbar gutter', () => {
    expect(playerStatisticSubjectLabel('strawberry')).toBe('STRAWBERRY');
    const layout = statisticsScreenLayout({ x: 20, y: 30, width: 620, height: 320 });
    expect(layout.viewport.x + layout.viewport.width).toBeLessThan(layout.scrollbar.x);
    expect(layout.visibleRows).toBeGreaterThan(5);
  });

  it('shows arbitrary active statistics and item subjects without resurrecting retired definitions', () => {
    const source = bootstrapContentRegistry();
    const moonLedger = {
      ...source.items.get('item:wood')!,
      id: 'item:moon_ledger' as const,
      displayName: 'Moon Ledger',
    };
    const registry = buildContentRegistry([
      ...bootstrapContentRows(),
      { id: moonLedger.id, kind: moonLedger.kind, json: moonLedger },
      { id: 'statistic:moon_records', kind: 'statistic', json: {
        id: 'statistic:moon_records', kind: 'statistic', schemaVersion: 1,
        name: 'Moon Records', description: 'Arbitrary active statistic fixture.',
        category: 'items', unit: 'count', aggregation: 'counter', subject: 'item_kind',
        milestones: ['1', '5'],
      } },
      { id: 'statistic:retired_records', kind: 'statistic', json: {
        id: 'statistic:retired_records', kind: 'statistic', schemaVersion: 1, retired: true,
        name: 'Retired Records', description: 'Must remain hidden.',
        category: 'items', unit: 'count', aggregation: 'counter', subject: 'item_kind',
        milestones: ['1'],
      } },
    ]).registry;
    const rows = visiblePlayerStatisticRows({ contentRegistry: registry, statistics: [
      { statisticKind: 'retired_records', subjectKind: 'moon_ledger', value: 9n },
      { statisticKind: 'moon_records', subjectKind: 'moon_ledger', value: 2n },
    ] });
    expect(rows.map(({ statisticKind }) => statisticKind)).toEqual(['moon_records']);
    expect(playerStatisticSubjectLabel('moon_ledger', registry)).toBe('MOON LEDGER');
  });

  it('keeps missing statistics hidden and uses neutral subjects for retired live items', () => {
    const source = bootstrapContentRegistry();
    const registry = buildContentRegistry(bootstrapContentRows().map((row) => {
      if (row.id !== 'item:marlow_book') return row;
      return { ...row, json: { ...source.items.get(row.id)!, retired: true } };
    })).registry;
    expect(visiblePlayerStatisticRows({ contentRegistry: registry, statistics: [
      { statisticKind: 'missing_records', subjectKind: 'marlow_book', value: 3n },
    ] })).toEqual([]);
    expect(playerStatisticSubjectLabel('marlow_book', registry)).toBe('MARLOW BOOK');
    expect(playerStatisticSubjectLabel('missing_subject', registry)).toBe('MISSING SUBJECT');
  });
});
