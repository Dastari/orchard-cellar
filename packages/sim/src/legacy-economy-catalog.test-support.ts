import type { LegacyEconomyCatalog } from './economy-catalog.js';

// Keep the golden catalog in its authoring package. The variable path prevents
// the sim TypeScript project from treating that test-only module as production
// input outside its rootDir; Vitest still resolves it relative to this module.
const toolCatalogModulePath: string = '../../tools/src/legacy-economy-catalog.js';
const toolCatalog = await import(toolCatalogModulePath) as {
  readonly LEGACY_ECONOMY_CATALOG: LegacyEconomyCatalog;
};

export const LEGACY_ECONOMY_CATALOG = toolCatalog.LEGACY_ECONOMY_CATALOG;
