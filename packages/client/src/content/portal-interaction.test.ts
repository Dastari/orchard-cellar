import { describe, expect, it } from 'vitest';
import type { ContentRegistry, SpaceContentDefinition } from '@orchard/sim';
import spacesJson from '../../../assets/content/spaces.json';
import { authoredSpacePortalPrompt, type RuntimeSpacePortalReference } from './portal-interaction.js';

const authoredSpaces = spacesJson as unknown as readonly SpaceContentDefinition[];
const base = {
  spaces: new Map(authoredSpaces.map((space) => [space.id, space])),
} as unknown as ContentRegistry;

function portalRow(kind: string): RuntimeSpacePortalReference {
  const portal = authoredSpaces.flatMap((space) => space.portals ?? [])
    .find((candidate) => candidate.portalKind === kind)!;
  const from = base.spaces.get(portal.fromSpace)!;
  const to = base.spaces.get(portal.toSpace)!;
  return {
    id: Number(portal.runtimeId),
    kind: portal.portalKind,
    fromSpace: from.spaceId,
    fromTileX: portal.fromTileX,
    fromTileY: portal.fromTileY,
    toSpace: to.spaceId,
    toTileX: portal.toTileX,
    toTileY: portal.toTileY,
  };
}

function withSpaces(spaces: ReadonlyMap<string, SpaceContentDefinition>): ContentRegistry {
  return { ...base, spaces };
}

describe('authored space portal prompts', () => {
  it('preserves the canonical authored tent threshold wording', () => {
    expect(authoredSpacePortalPrompt(base, portalRow('marlow_tent_enter')))
      .toEqual({ authored: true, prompt: "ENTER MARLOW'S TENT" });
    expect(authoredSpacePortalPrompt(base, portalRow('marlow_tent_exit')))
      .toEqual({ authored: true, prompt: "LEAVE MARLOW'S TENT" });
  });

  it('follows arbitrary portal kinds and renamed space definition ids', () => {
    const island = base.spaces.get('space:island')!;
    const tent = base.spaces.get('space:marlow_tent')!;
    const renamedIslandId = 'space:renamed_shore' as const;
    const renamedTentId = 'space:renamed_shelter' as const;
    const renamedPortalKind = 'cross_the_canvas_threshold';
    const renamedIsland: SpaceContentDefinition = {
      ...island,
      id: renamedIslandId,
      portals: island.portals?.map((portal) => ({
        ...portal,
        portalKind: renamedPortalKind,
        fromSpace: portal.fromSpace === island.id ? renamedIslandId : renamedTentId,
        toSpace: portal.toSpace === island.id ? renamedIslandId : renamedTentId,
      })),
    };
    const renamedTent: SpaceContentDefinition = { ...tent, id: renamedTentId };
    const spaces = new Map(base.spaces);
    spaces.delete(island.id);
    spaces.delete(tent.id);
    spaces.set(renamedIsland.id, renamedIsland);
    spaces.set(renamedTent.id, renamedTent);
    const row = { ...portalRow('marlow_tent_enter'), kind: renamedPortalKind };

    expect(authoredSpacePortalPrompt(withSpaces(spaces), row))
      .toEqual({ authored: true, prompt: "ENTER MARLOW'S TENT" });
  });

  it('fails closed for missing, retired, ambiguous, or stale endpoint content', () => {
    const row = portalRow('marlow_tent_enter');
    const tent = base.spaces.get('space:marlow_tent')!;

    const missing = new Map(base.spaces);
    missing.delete(tent.id);
    expect(authoredSpacePortalPrompt(withSpaces(missing), row))
      .toEqual({ authored: true, prompt: null });

    const retired = new Map(base.spaces);
    retired.set(tent.id, { ...tent, retired: true });
    expect(authoredSpacePortalPrompt(withSpaces(retired), row))
      .toEqual({ authored: true, prompt: null });

    const ambiguous = new Map(base.spaces);
    ambiguous.set('space:duplicate_tent', { ...tent, id: 'space:duplicate_tent' });
    expect(authoredSpacePortalPrompt(withSpaces(ambiguous), row))
      .toEqual({ authored: true, prompt: null });

    expect(authoredSpacePortalPrompt(base, { ...row, toTileX: row.toTileX + 1 }))
      .toEqual({ authored: true, prompt: null });
    expect(authoredSpacePortalPrompt(base, { ...row, kind: 'stale_kind' }))
      .toEqual({ authored: true, prompt: null });
    expect(authoredSpacePortalPrompt(base, { ...row, id: 123 }))
      .toEqual({ authored: false, prompt: null });
  });
});


it('labels every village building entrance and exit from its active authored name',()=>{
  const interiors=authoredSpaces.filter(space=>space.generator==='village_interior');
  expect(interiors).toHaveLength(10);
  for(const interior of interiors){
    for(const portal of interior.portals??[]){
      const entering=portal.toSpace===interior.id;
      expect(authoredSpacePortalPrompt(base,portalRow(portal.portalKind))).toEqual({
        authored:true,prompt:`${entering?'ENTER':'LEAVE'} ${interior.name.toUpperCase()}`,
      });
    }
  }
});
