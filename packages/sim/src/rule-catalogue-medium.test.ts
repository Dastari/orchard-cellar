import { describe, expect, it } from 'vitest';
import { connectedObjectCatalogue } from './connected-objects.js';
import { parseRuleCatalogue, resolveRuleFrame, RULE_MEDIA, type AvailableRuleFamily, type RuleRole } from './rule-catalogue.js';
import { parseTilesetDefinition } from './content/definitions.js';
import { bootstrapDefinitionsOfKind } from './content/bootstrap-pack-loader.js';
const source = () => structuredClone(connectedObjectCatalogue().families[0]) as AvailableRuleFamily;
function withMedium(medium: unknown) {
  const f = source();
  return {schemaVersion:1,families:[{...f,roles:{...f.roles,mask_0:{...f.roles.mask_0,medium}}}]};
}
describe('D6 per-role medium declaration (schema only)', () => {
  it.each(RULE_MEDIA)('round trips %s without changing frame or collision behavior', medium => {
    const family = parseRuleCatalogue(withMedium(medium)).families[0] as AvailableRuleFamily;
    expect(family.roles.mask_0).toMatchObject({medium});
    expect(resolveRuleFrame(family,0)).toEqual(resolveRuleFrame(source(),0));
    const tileset = bootstrapDefinitionsOfKind('tileset')[0]!;
    const parsed = parseTilesetDefinition({...tileset,ruleCatalogue:{schemaVersion:1,families:[family]}});
    expect(parseTilesetDefinition(JSON.stringify(parsed))).toEqual(parsed);
  });
  it('retains a medium even when artwork for a role is explicitly unavailable', () => {
    const f=source();
    const c=parseRuleCatalogue({schemaVersion:1,families:[{...f,roles:{...f.roles,mask_0:{unavailable:'No reviewed lava art',medium:'lava'}}}]});
    expect((c.families[0] as AvailableRuleFamily).roles.mask_0).toEqual({unavailable:'No reviewed lava art',medium:'lava'});
    expect(resolveRuleFrame(c.families[0]!,0)).toBeNull();
  });
  it('preserves old roles without adding an inferred medium', () => {
    const role = (parseRuleCatalogue({schemaVersion:1,families:[source()]}).families[0] as AvailableRuleFamily).roles.mask_0 as RuleRole;
    expect(role).not.toHaveProperty('medium');
  });
  it.each(['ocean','fire','',null,12])('rejects unknown or malformed medium %j', medium => {
    expect(()=>parseRuleCatalogue(withMedium(medium))).toThrow(/roles.mask_0.medium/);
  });
});
