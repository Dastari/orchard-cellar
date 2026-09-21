export interface FarmActionPromptState {
  readonly targeted: boolean;
  readonly selectedTool: 'cultivate' | 'water' | null;
  readonly seedSelected: boolean;
  readonly compostSelected?: boolean;
  readonly cropComposted?: boolean;
  readonly treeSeedSelected: boolean;
  readonly soilExists: boolean;
  readonly soilWatered: boolean;
  readonly cropName: string | null;
  readonly cropMature: boolean;
  readonly cropWatered: boolean;
}

/** Keeps the displayed farm action aligned with the input path. Tool actions
 * take priority over passive crop status so selecting a watering can always
 * exposes the action that F or a primary pointer press will perform. Harvest
 * is an inventory collection interaction and therefore uses E. */
export function farmActionPrompt(state: FarmActionPromptState): string | null {
  if (!state.targeted) return null;
  const cropName = state.cropName?.toUpperCase() ?? null;
  if (state.compostSelected) {
    if (cropName === null) return 'TARGET A GROWING CROP';
    if (state.cropComposted) return `${cropName} ALREADY COMPOSTED`;
    if (state.cropMature) return `[E] HARVEST ${cropName}`;
    return `[F] COMPOST ${cropName} (+25% GROWTH, ONCE PER PLANTING)`;
  }
  if (state.selectedTool === 'water') {
    if (!state.soilExists) return 'TILL SOIL BEFORE WATERING';
    if (state.soilWatered) return `${cropName ?? 'SOIL'} ALREADY WATERED`;
    return `[F] WATER ${cropName ?? 'SOIL'}`;
  }
  if (state.selectedTool === 'cultivate' && cropName !== null) return `[F] DIG UP ${cropName}`;
  if (cropName !== null) {
    if (state.cropMature) return `[E] HARVEST ${cropName}`;
    return `${cropName} ${state.cropWatered ? 'GROWING' : 'NEEDS WATER'}`;
  }
  if (state.seedSelected && state.treeSeedSelected) return '[F] PLANT TREE SEED';
  if (state.seedSelected) return state.soilExists ? '[F] PLANT SEEDS' : 'TILL SOIL BEFORE PLANTING';
  if (state.selectedTool === 'cultivate') return state.soilExists ? '[F] RESTORE GRASS' : '[F] TILL SOIL';
  return null;
}
