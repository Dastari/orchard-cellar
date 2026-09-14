import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');

describe('authored Delve boon source authority',()=>{
  it('keeps the boon catalog out of runtime source and threads active registries through every consumer',()=>{
    const sim=read('../../sim/src/roguelike.ts'),world=read('../../world/src/index.ts');
    const client=read('../../client/src/overworld-main.ts'),ui=read('../../ui/src/roguelike-ui.ts');
    const production=[sim,world,client,ui].join('\n');
    expect(production).not.toContain('ROGUE_UPGRADES');
    expect(production).not.toMatch(/['"](?:keen_edge|fletchers_eye|quick_hands|fleet_foot|lucky_strike|iron_heart|field_dressing|heavy_blows)['"]/u);
    expect(world).toContain('generateRogueUpgradeOffers(run.seed, run.roomNumber, kind,contentRegistry(ctx))');
    expect(world).toContain('rogueUpgradeDefinition(contentRegistry(ctx),offer.upgradeId)');
    const choose=world.slice(world.indexOf('export const chooseRogueReward ='),world.indexOf('export const skipRogueReward ='));
    expect(choose.indexOf('rogueUpgradeDefinition(contentRegistry(ctx),offer.upgradeId)'))
      .toBeLessThan(choose.indexOf('ctx.db.rogue_run_upgrade.insert'));
    expect(world).toContain('rogueUpgradeDefinition(registry,upgrade.upgradeId)');
    expect(client).toContain('rogueUpgradeDefinition(snapshot.content.registry,upgrade.upgradeId)');
    expect(client).toContain('drawRogueRewardOverlay(\n        snapshot.content.registry,');
    expect(ui).toContain('rogueUpgradeDefinition(registry,offer.upgradeId)');
  });
});
