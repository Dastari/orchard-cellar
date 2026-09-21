import { uiActorLibrary } from '../actors.js';
import type { UiLabSpecimen } from '../registry.js';
export const actorsSpecimen: UiLabSpecimen = {
  id: 'actors', title: 'NPC, enemy and effect library', district: 'actors', size: { width: 1600, height: 900 },
  build(_ui, _props, mock) {
    return uiActorLibrary({ actors: mock.actors ?? [], assets: mock.assets ?? new Map(), request: mock.requestAsset ?? (() => {}), activate: mock.activate });
  },
};
