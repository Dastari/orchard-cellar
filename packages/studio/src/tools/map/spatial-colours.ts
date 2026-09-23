/** Token file: tints for map viewport overlays (targets, crops, markers).
 * These colour spatial content only. Kit chrome takes its colour from kit
 * tones, never from here. Colour literals are allowed only in token and
 * content files (see `eslint.config.js`, orchard-ui-kit/no-colour-literals). */
export const MAP_SPATIAL_COLOURS = Object.freeze({
  livePlaceable: '#df9bc7',
  liveChest: '#d7a668',
  liveHomestead: '#f0c777',
  liveResource: '#72c77a',
  liveEnemy: '#dc7777',
  liveWildlife: '#a7a7d9',
  liveNpc: '#f1b34b',
  offlinePlayer: '#77838d',
  onlinePlayer: '#64b7e8',

  resizeCrop: 'rgba(154, 49, 42, 0.48)',
  targetWaiting: 'rgba(239, 188, 83, 0.28)',
  targetReady: 'rgba(104, 187, 114, 0.34)',
  targetNpc: 'rgba(241, 179, 75, 0.34)',
  planValid: '#b9f6bd',
  planInvalid: '#ff8f82',
  grid: 'rgba(255, 255, 255, 0.52)',
  disabledMarker: 'rgba(110, 110, 110, 0.62)',
  selectedMarker: '#ffffff',
  landmark: '#f3d37a',
  authoredObject: '#8ad7dd',
  liveSelectionMask: 'rgba(255,206,82,0.48)',
});
