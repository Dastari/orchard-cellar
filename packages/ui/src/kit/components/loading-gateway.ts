import type { LoadedAsset } from '../../assets.js';
import type { UiStyle } from '../layout/box.js';
import type { UiElement } from '../runtime/element.js';
import { uiText } from './text.js';
import { uiLoadingBar, uiTitleFrame, uiTitleNotice, uiTitleSentence } from './gateway-game.js';

export interface UiLoadingGatewayModel {
  readonly title: string;
  readonly detail: string;
  readonly progress: number;
  readonly error?: boolean;
}
export interface UiLoadingGatewayOptions {
  readonly model: UiLoadingGatewayModel;
  readonly emblem?: LoadedAsset;
  readonly cask?: LoadedAsset;
  readonly version?: string;
  readonly layout?: UiStyle;
}
export interface UiLoadingGatewayElement extends UiElement {
  updateLoading(model: UiLoadingGatewayModel): void;
}
/** Loading stages share the title flow's constant frame: LOADING with the stage, the gold bar and its
 * detail; a failed stage becomes CONNECTION LOST with a dark error notice. Hosts own connection state. */
export function uiLoadingGateway(options: UiLoadingGatewayOptions): UiLoadingGatewayElement {
  const notice = uiTitleNotice({ id: 'gateway.loading.error' });
  const status = uiText('', { id: 'gateway.loading.status', wrap: true, align: 'center', layout: { width: 'grow' } });
  const progress = uiLoadingBar({ id: 'gateway.loading.progress', width: 200 });
  const detail = uiText('', { id: 'gateway.loading.detail', role: 'caption', wrap: true, align: 'center', layout: { width: 'grow' } });
  const frame = uiTitleFrame({ id: 'game.loading', title: 'LOADING', apple: options.emblem, cask: options.cask, version: options.version,
    layout: options.layout, body: [notice, status, progress, detail] });
  const updateLoading = (model: UiLoadingGatewayModel): void => {
    const value = Number.isFinite(model.progress) ? Math.max(0, Math.min(100, model.progress)) : 0, error = model.error === true;
    const title = uiTitleSentence(model.title), text = uiTitleSentence(model.detail);
    frame.setTitle(error ? 'CONNECTION LOST' : 'LOADING');
    notice.setText(error ? title : ''); notice.setStyle({ visible: error });
    status.setProps({ text: error ? text : value < 100 && title ? `${title.replace(/[.\s]+$/u, '')}...` : title });
    progress.setProps({ value: value / 100, tone: error ? 'danger' : 'success', label: `Loading ${Math.round(value)}%` }).setStyle({ visible: !error });
    detail.setProps({ text: error ? '' : text }).setStyle({ visible: !error && text !== '' });
  };
  updateLoading(options.model);
  return Object.assign(frame, { updateLoading });
}
