import type { StudioSelection } from './selection.js';

export function studioSelectionFields(selection: StudioSelection): readonly string[] {
  switch (selection.kind) {
    case 'tile': return [`SPACE  ${selection.spaceId}`, `TILE X  ${selection.tileX}`, `TILE Y  ${selection.tileY}`];
    case 'entity': return [`ENTITY  ${selection.entityKind}`, `ID  ${selection.id}`, `SPACE  ${selection.spaceId}`];
    case 'player': return [`PLAYER  ${selection.identity}`, `SPACE  ${selection.spaceId ?? 'OFFLINE'}`];
    case 'definition': return [`DEFINITION  ${selection.definitionKind}`, `ID  ${selection.id}`];
    case 'none': return ['SELECT A TILE, ENTITY, PLAYER, OR DEFINITION IN THE WORKSPACE.'];
  }
}
