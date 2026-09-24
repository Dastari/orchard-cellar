/** Production retained UI entry. No Studio shell, lab fixtures or demo dispatch. */
export { GameUiRuntime, type GameUiHost, type GameUiPointerScope } from './game-host/runtime.js';
export { UiRoot } from './kit/runtime/root.js';
export { UiTextBridge } from './kit/runtime/text-bridge.js';
export type { UiRootPointer } from './kit/runtime/input.js';
export type { UiElement, UiElementKey, UiElementWheel } from './kit/runtime/element.js';
export { loadUiKitArt, type UiKitArt } from './kit/components/art.js';
export { uiFixed, uiOffset } from './kit/layout/box.js';
export { DelveRewardsUi } from './game-host/overlays.js';
export { GameGateway, GameGatewayLoading, gameGatewayLayout, type GameGatewayModel } from './game-host/gateway.js';

export { GameOnlinePlayers, type GameOnlinePlayersModel, type OnlinePlayerManagementRequest } from './game-host/online-players.js';

export { GameFeedback, type GameFeedbackModel, type GameSkillNoticeScope } from './game-host/feedback.js';
