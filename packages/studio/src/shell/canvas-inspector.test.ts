import { describe, expect, it } from 'vitest';
import { studioSelectionFields } from './canvas-inspector.js';

describe('canvas Inspector projection', () => {
  it('describes every typed selection without an HTML projection', () => {
    expect(studioSelectionFields({ kind: 'tile', spaceId: 7, tileX: 12, tileY: -4 }))
      .toEqual(['SPACE  7', 'TILE X  12', 'TILE Y  -4']);
    expect(studioSelectionFields({ kind: 'entity', entityKind: 'horse', id: 'e-2', spaceId: 3 }))
      .toEqual(['ENTITY  horse', 'ID  e-2', 'SPACE  3']);
    expect(studioSelectionFields({ kind: 'player', identity: 'identity-a', spaceId: null }))
      .toEqual(['PLAYER  identity-a', 'SPACE  OFFLINE']);
    expect(studioSelectionFields({ kind: 'definition', definitionKind: 'item', id: 'apple' }))
      .toEqual(['DEFINITION  item', 'ID  apple']);
    expect(studioSelectionFields({ kind: 'none' })).toEqual([
      'SELECT A TILE, ENTITY, PLAYER, OR DEFINITION IN THE WORKSPACE.',
    ]);
  });
});
