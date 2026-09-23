/** Production retained UI entry. No Studio shell, lab fixtures or demo dispatch. */
export { GameUiRuntime, type GameUiHost } from './game-host/runtime.js';
export { UiRoot } from './kit/runtime/root.js';
export { UiTextBridge } from './kit/runtime/text-bridge.js';
export type { UiRootPointer } from './kit/runtime/input.js';
export type { UiElement, UiElementKey, UiElementWheel } from './kit/runtime/element.js';
export { loadUiKitArt, type UiKitArt } from './kit/components/art.js';
export { uiFixed, uiOffset } from './kit/layout/box.js';
