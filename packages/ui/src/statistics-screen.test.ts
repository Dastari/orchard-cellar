import { describe, expect, it } from 'vitest';
import { playerStatisticDefinition } from '@orchard/sim';
import {
  formatPlayerStatisticValue,
  playerStatisticSubjectLabel,
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

  it('uses item display names for subject labels', () => {
    expect(playerStatisticSubjectLabel('strawberry')).toBe('STRAWBERRY');

  });
});
