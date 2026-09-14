import { describe, expect, it } from 'vitest';
import { CharacterStudioModel, CHARACTER_TOOL_REGISTRATION } from './model.js';
import { characterRigAssetIds, characterRigAudit } from './canvas.js';

describe('Character Studio tool', () => {
  it('registers, selects actions, and equips each semantic rig slot', () => {
    const model = new CharacterStudioModel();
    model.selectAction('ranged_weapon'); model.face('left');
    model.equip('helm_heavy'); model.equip('chest_gold'); model.equip('legs_bronze');
    expect(model.snapshot()).toMatchObject({ action: 'ranged_weapon', facing: 'left', equipment: {
      head: 'helm_heavy', body: 'chest_gold', legs: 'legs_bronze',
    } });
    expect(CHARACTER_TOOL_REGISTRATION.routes).toEqual(['/author/character']);
  });

  it('resolves every required core, appearance, wearable, and tool rig asset id', () => {
    expect(characterRigAudit()).toEqual([]);
    expect(characterRigAssetIds().length).toBeGreaterThan(60);
    expect(characterRigAssetIds()).toContain('action_cf_base');
    expect(characterRigAssetIds()).toContain('wearable_cf_plate_chest');
    expect(characterRigAssetIds()).toContain('tool_cf_wooden_bow_action');
  });
});
