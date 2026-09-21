import { uiRibbon } from './anchors.js';
import type { LoadedAsset } from '../../assets.js';
import type { UiStyle } from '../layout/box.js';
import { uiFixed } from '../layout/box.js';
import type { UiElement } from '../runtime/element.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiSprite } from './media.js';
import { uiProgressBar } from './meter.js';

export interface UiLoadingGatewayModel {
  readonly title: string;
  readonly detail: string;
  readonly progress: number;
  readonly error?: boolean;
}
export interface UiLoadingGatewayOptions {
  readonly model: UiLoadingGatewayModel;
  readonly emblem?: LoadedAsset;
  readonly version?: string;
  readonly layout?: UiStyle;
}
export interface UiLoadingGatewayElement extends UiElement {
  updateLoading(model: UiLoadingGatewayModel): void;
}
/** The same account frame carries loading stages; hosts own connection state. */
export function uiLoadingGateway(options: UiLoadingGatewayOptions): UiLoadingGatewayElement {
  const title = uiText('', { role: 'header', wrap: true, align: 'center' });
  const detail = uiText('', { wrap: true, align: 'center' });
  const percentage = uiText('', { align: 'center' });
  const progress = uiProgressBar({ id: 'gateway.loading.progress', label: 'Loading progress', value: 0 });
  const emblem = options.emblem ? uiSprite(options.emblem, {
    animation: Object.keys(options.emblem.metadata.animations)[0] ?? 'base', playing: false,
    label: 'Orchard emblem', layout: { width: uiFixed(16), height: uiFixed(16), shrink: 0 },
  }) : undefined;
  const frame = uiFrame({ id: 'game.loading', header: { title: 'ORCHARD & CELLAR', content: uiRibbon({ label: 'ORCHARD & CELLAR', layout: { width: 'grow' } }) },
    layout: { width: 'grow', height: 'grow', ...options.layout }, children: [
      uiScrollArea({ gap: 8 }, [
        uiFlex({ direction: 'row', width: 'grow', align: 'center', gap: 4 }, [
          ...(emblem ? [emblem] : []), uiText(options.version ? `V${options.version}` : '', { role: 'caption', align: 'right' }),
        ]), title, detail, progress, percentage,
      ]),
    ],
  });
  const updateLoading = (model: UiLoadingGatewayModel): void => {
    const value = Number.isFinite(model.progress) ? Math.max(0, Math.min(100, model.progress)) : 0;
    title.setProps({ text: model.title }); detail.setProps({ text: model.detail });
    progress.setProps({ value: value / 100, tone: model.error ? 'danger' : 'success' });
    percentage.setProps({ text: `${Math.round(value)}%` });
  };
  updateLoading(options.model);
  return Object.assign(frame, { updateLoading });
}
