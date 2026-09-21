import { importPremiumTools } from './assets/premium-icon-import.js';

// Compatibility entry point: never restore the retired hammer/shovel masters.
await importPremiumTools();
console.log('Imported premium tool replacements for the original hammer/shovel icons.');
