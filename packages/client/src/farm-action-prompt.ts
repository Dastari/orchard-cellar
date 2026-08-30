export interface FarmActionPromptState {
  readonly targeted: boolean;
  readonly selectedItem: string;
  readonly seedSelected: boolean;
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
  if (state.selectedItem === 'watering_can') {
    if (!state.soilExists) return 'TILL SOIL BEFORE WATERING';
    if (state.soilWatered) return `${cropName ?? 'SOIL'} ALREADY WATERED`;
    return `[F] WATER ${cropName ?? 'SOIL'}`;
  }
  if (state.selectedItem === 'hoe' && cropName !== null) return `[F] DIG UP ${cropName}`;
  if (cropName !== null) {
    if (state.cropMature) return `[E] HARVEST ${cropName}`;
    return `${cropName} ${state.cropWatered ? 'GROWING' : 'NEEDS WATER'}`;
  }
  if (state.seedSelected) return state.soilExists ? '[F] PLANT SEEDS' : 'TILL SOIL BEFORE PLANTING';
  if (state.selectedItem === 'hoe') return state.soilExists ? '[F] RESTORE GRASS' : '[F] TILL SOIL';
  return null;
}
