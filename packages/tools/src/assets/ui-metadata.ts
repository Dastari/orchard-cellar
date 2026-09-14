import type { AssetSource } from './types.js';

export function uiMetadataErrors(asset: AssetSource): string[] {
  if (asset.category !== 'ui') return [];
  const errors: string[] = [];
  // Legacy UI anchors predate explicit layout intent. All Cute Fantasy catalog
  // entries must opt in so consumers never have to infer scaling from pixels.
  if (asset.sourcePath?.startsWith('references/art/kenmi/cute-fantasy/ui/') && !asset.uiSizing) {
    errors.push(`${asset.name}: Cute Fantasy UI assets must declare uiSizing`);
  }
  if (asset.uiSizing === 'nine_slice' && !asset.slice) {
    errors.push(`${asset.name}: nine_slice UI assets must declare slice insets`);
  }
  if (asset.slice) {
    const [left, top, right, bottom] = asset.slice;
    if ([left, top, right, bottom].some((value) => !Number.isSafeInteger(value) || value < 0)
      || left + right > asset.size[0] || top + bottom > asset.size[1]) {
      errors.push(`${asset.name}: slice insets must be non-negative integers inside the authored canvas`);
    }
  }
  if (asset.uiRequiredStates) {
    if (!asset.uiRequiredStates.includes('idle')) errors.push(`${asset.name}: uiRequiredStates must include idle`);
    if (new Set(asset.uiRequiredStates).size !== asset.uiRequiredStates.length) errors.push(`${asset.name}: uiRequiredStates must be unique`);
    for (const state of asset.uiRequiredStates) {
      if (!asset.frames[state]) errors.push(`${asset.name}: missing required UI state ${state}`);
      else if (asset.frameKinds?.[state] !== 'state') errors.push(`${asset.name}: required UI state ${state} must be declared as a state`);
    }
  }
  if (asset.tags?.includes('ui.kit')) {
    for (const group of Object.keys(asset.frames)) {
      if (asset.frameKinds?.[group] === undefined) errors.push(`${asset.name}: kit group ${group} must declare frameKinds`);
      if (asset.sourceRegions?.[group] === undefined) errors.push(`${asset.name}: kit group ${group} must declare sourceRegions`);
    }
    if (asset.sourcePaletteMode !== 'exact') errors.push(`${asset.name}: kit art requires exact sourcePalette`);
    if (asset.slice && (asset.slice[0] + asset.slice[2] >= asset.size[0]
      || asset.slice[1] + asset.slice[3] >= asset.size[1])) errors.push(`${asset.name}: kit nine-slice must retain a repeat band`);
  }
  for (const [group, regions] of Object.entries(asset.sourceRegions ?? {})) {
    const frames = asset.frames[group];
    if (!frames) { errors.push(`${asset.name}: sourceRegions references missing group ${group}`); continue; }
    if (regions.length !== frames.length) errors.push(`${asset.name}: sourceRegions.${group} must match its frame count`);
    for (const [x, y, width, height] of regions) {
      if (![x, y, width, height].every(Number.isSafeInteger) || x < 0 || y < 0 || width <= 0 || height <= 0
        || width > asset.size[0] || height > asset.size[1]) {
        errors.push(`${asset.name}: sourceRegions.${group} entries must fit the authored canvas`);
      }
    }
  }
  return errors;
}
