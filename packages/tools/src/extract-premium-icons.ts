import { importPremiumIcon, importPremiumTools, premiumFarmingSheet } from './assets/premium-icon-import.js';

await importPremiumTools();
for (const [fruit, column, row] of [['apple', 1, 10], ['peach', 4, 10], ['pear', 7, 10], ['cherry', 0, 11]] as const) {
  await importPremiumIcon(`icon_seed_${fruit}`, premiumFarmingSheet, column, row, ['item.seed', 'seed.orchard', `fruit.${fruit}`]);
}
console.log('Imported premium hammer, six shovels, legacy shovel alias, and four orchard seed icons.');
