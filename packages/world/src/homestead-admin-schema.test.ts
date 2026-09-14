import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function sourceBetween(startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('admin homestead relocation authority', () => {
  it('moves the marker and bidirectional portal pair behind owner authority', () => {
    const reducer = sourceBetween(
      'export const adminMoveHomestead =',
      '/** Restoring history creates a new head revision;',
    );
    expect(reducer).toContain('requireWorldOwner(');
    expect(reducer).toContain('collisionForSpace(ctx, TOPSIDE_SPACE_ID, home.spaceId)');
    expect(reducer).toContain('homesteadMarkerPlacementTiles(tileX, tileY)');
    expect(reducer).toContain('tileOverlapsAnyPlayer(ctx, TOPSIDE_SPACE_ID');
    expect(reducer).toContain('ctx.db.homestead.spaceId.update');
    expect(reducer.match(/ctx\.db\.space_portal\.id\.update/g)).toHaveLength(2);
    expect(reducer).toContain("action: 'admin_move_homestead'");
    expect(reducer).not.toContain('.delete(');
  });

  it('requires a complete, flat destination before mutating any durable row', () => {
    const reducer = sourceBetween(
      'export const adminMoveHomestead =',
      '/** Restoring history creates a new head revision;',
    );
    const firstMutation = reducer.indexOf('ctx.db.homestead.spaceId.update');
    expect(reducer.indexOf("throw new SenderError('homestead_site_blocked')")).toBeLessThan(firstMutation);
    expect(reducer.indexOf("throw new SenderError('homestead_portal_missing')")).toBeLessThan(firstMutation);
    expect(reducer).toContain('(collision.elevations?.[index] ?? 0) !== anchorElevation');
    expect(reducer).toContain('fromTileY: tileY + 1');
    expect(reducer).toContain('toTileY: tileY + 2');
  });
});
