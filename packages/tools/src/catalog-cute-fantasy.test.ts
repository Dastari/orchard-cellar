import { describe, expect, it } from 'vitest';
import { canonicalBlob47Index, connectionRole, inferCategory, inferGrid } from './catalog-cute-fantasy.js';

describe('Cute Fantasy catalog inference', () => {
  it('classifies source families without depending on pack-specific root names', () => {
    expect(inferCategory('references/Cute_Fantasy/Tiles/Grass/Grass_Tiles_1.png')).toBe('terrain');
    expect(inferCategory('references/Cute_Fantasy_Free/Player/Player.png')).toBe('character');
    expect(inferCategory('references/Cute_Fantasy_Volcano/Enemies/Flying_Skull.png')).toBe('enemy');
    expect(inferCategory('references/Cute_Fantasy/Animals/Cow/Cow_01.png')).toBe('animal');
    expect(inferCategory('references/Cute_Fantasy/Trees/Medium_Oak_Tree.png')).toBe('vegetation');
    expect(inferCategory('references/Cute_Fantasy_UI/UI/Icons.png')).toBe('ui');
  });

  it('prefers canonical terrain and character grid sizes', () => {
    expect(inferGrid('references/Cute_Fantasy/Tiles/Water.png', 112, 96).cell).toEqual([16, 16]);
    expect(inferGrid('references/Cute_Fantasy_Characters/Characters/Mage.png', 128, 96).cell).toEqual([32, 32]);
    expect(inferGrid('references/Cute_Fantasy/Buildings/Houses/House.png', 96, 80).mode).toBe('whole');
  });

  it('uses the same canonical 47-frame ordering as the runtime autotiler', () => {
    expect(canonicalBlob47Index(0, 0)).toBe(0);
    expect(canonicalBlob47Index(1, 0)).toBe(1);
    expect(canonicalBlob47Index(3, 0)).toBe(3);
    expect(canonicalBlob47Index(3, 1)).toBe(4);
    expect(canonicalBlob47Index(15, 15)).toBe(46);
  });

  it('names directional roles with compass-stable semantics', () => {
    expect(connectionRole(1)).toBe('end_north');
    expect(connectionRole(3)).toBe('corner_north_east');
    expect(connectionRole(7)).toBe('t_missing_west');
    expect(connectionRole(15, ['north_east'])).toBe('center__inner_open_north_east');
  });
});
