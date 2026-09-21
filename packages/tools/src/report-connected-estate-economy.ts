/** Deterministic throughput lower bounds, not measured player acquisition time. */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { bootstrapContentRegistry, estateVintageTier, hearthResidenceExpansionQuote, AUTHORITY_HZ } from '@orchard/sim';

const registry = bootstrapContentRegistry();
const press = registry.processes.get('process:press_apple')!;
const ferment = registry.processes.get('process:ferment_must')!;
const mustPerPress = press.outputs.find(output => output.item === ferment.input.item)!.count;
const mustPerBatch = ferment.input.count;
const bottlesPerBatch = ferment.outputs.find(output => output.item === 'item:bottles')!.count;
const fruitPerBottle = mustPerBatch * press.input.count / mustPerPress / bottlesPerBatch;
const baseBottle = registry.items.get('item:bottles')!.economy.sell;
const appleCost = registry.items.get('item:apple')!.economy.buy!;
const questGrant = registry.quests.get('quest:marlow_first_bottle')!.rewards.bronze;
const costs = [hearthResidenceExpansionQuote(0)!.costBronze, hearthResidenceExpansionQuote(1)!.costBronze];

// Identical presses run continuously; a batch loads the next free cask as soon as
// the authored Must requirement is met. Handling, travel, construction, station cost and idle time are
// excluded explicitly. Finite event simulation includes the initial warm-up.
function timeForBottles(count: number, machines: number, rank: number): number {
  const tier = estateVintageTier(rank, BigInt(ferment.ticksPerUnit), baseBottle);
  const casks = Array<number>(machines).fill(0);
  let tick = 0, must = 0, finished = 0;
  while (finished < count) {
    tick++;
    if (tick % press.ticksPerUnit === 0) must += machines * mustPerPress;
    for (let i = 0; i < casks.length; i++) {
      if (casks[i] !== 0 && casks[i]! <= tick) { finished += bottlesPerBatch; casks[i] = 0; }
      if (casks[i] === 0 && must >= mustPerBatch) { must -= mustPerBatch; casks[i] = tick + Number(tier.agingTicks); }
    }
  }
  return tick / AUTHORITY_HZ / 60;
}
const rows = [0, 1, 2, 3].flatMap(rank => {
  const tier = estateVintageTier(rank, BigInt(ferment.ticksPerUnit), baseBottle);
  return costs.map((cost, index) => {
    const bottles = Number((cost + BigInt(tier.sellPriceBronze) - 1n) / BigInt(tier.sellPriceBronze));
    return `| ${rank} | ${index === 0 ? 'East' : 'South'} | ${cost} | ${tier.sellPriceBronze} | ${bottles} | ${timeForBottles(bottles, 1, rank).toFixed(1)} | ${timeForBottles(bottles, 3, rank).toFixed(1)} |`;
  });
});
const output = resolve(process.argv[2] ?? 'output/gameplay-loops/connected-economy.md');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `# Connected estate economy: source model\n\n` +
  `Base bottle income stays ${baseBottle} bronze; first-bottle quest stays ${questGrant}. ` +
  `One base bottle plus that quest pays ${baseBottle + questGrant}, below the first expansion ${costs[0]}. ` +
  `Two bottles plus the quest pay ${2 * baseBottle + questGrant} before any spending. Both sequential rooms cost ${costs[0]! + costs[1]!} combined. ` +
  `The former 3,200/4,200 prices each required one base bottle. New standalone equivalents are 12/36.\n\n` +
  `| Vintage | Room | Price | Bottle value | Whole bottles | One press/cask minutes | Three presses/casks minutes |\n` +
  `|---|---|---:|---:|---:|---:|---:|\n${rows.join('\n')}\n\n` +
  `These are production-only lower bounds starting with empty processors, unlimited fruit and no skills. ` +
  `Each row funds one room independently; no quest grant, previous room or Vintage upgrade costs are subtracted. ` +
  `${fruitPerBottle} bought apples cost ${fruitPerBottle * appleCost} bronze per bottle input; this is not net profit. ` +
  `Station construction, ingredient availability, fuel/repair, hauling, travel and manual output clearing must be measured in a fresh-player journey. ` +
  `Ranked rows assume that Vintage rank is already purchased, so they are not fresh-character forecasts. ` +
  `No bottle, crop, order or quest price was reduced.\n`);
console.log(output);
