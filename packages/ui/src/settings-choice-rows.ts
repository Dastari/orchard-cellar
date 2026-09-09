import type { PixelUi } from './pixel-ui.js';
import { drawPixelTextInRect } from './pixel-ui.js';
import type { UiSkin } from './skin.js';
import type { UiPoint } from './geometry.js';
import type { WidgetNode } from './widget.js';
import { lightingSettingsMode, type OverworldUiModel, type OverworldUiLayout, type SettingsTab } from './overworld-ui.js';
import { compactVideoRows, videoRowHeight as videoSettingsRowHeight } from './video-rows.js';
import { readWorldScale, worldScaleSettingLabel } from './world-scale-setting.js';
import { readPresentationCap } from './presentation-cap-setting.js';
import { worldBackendStatus } from './world-backend-setting.js';
import { drawMenuButton } from './overworld-panel-drawing.js';
import { drawBackendReason } from './world-backend-feedback.js';
export interface SettingsChoiceRowsView {
 readonly fonts: PixelUi; readonly skin: UiSkin; readonly pointer: UiPoint;
 readonly layout: OverworldUiLayout; readonly settingsTab: SettingsTab; readonly model: OverworldUiModel;
 readonly lightingQualityNode: WidgetNode; readonly worldScaleNode: WidgetNode;
 readonly presentationCapNode: WidgetNode;
}
export function drawSettingsChoiceRows(context: CanvasRenderingContext2D, view: SettingsChoiceRowsView): void {
    const { settingsContent } = view.layout;
    const settingRows = view.settingsTab === 'video' ? [
      ['DISPLAY MODE', view.model.fullscreen ? 'FULLSCREEN' : 'WINDOWED'],
      ['PIXEL SCALING', 'INTEGER'],
      ['WORLD ZOOM', 'AUTO'],
      ['UI SCALE', 'AUTO'],
      ['LIGHTING', lightingSettingsMode(view.model).toUpperCase()],
      ['WORLD SCALE', worldScaleSettingLabel(readWorldScale())],
      ['30 HZ CAP', readPresentationCap() === '30hz' ? 'ON' : 'OFF'],
      ['WEATHER DETAIL', 'HIGH'],
    ] as const : view.settingsTab === 'interface' ? [
      ['HUD VISIBILITY', 'FULL'],
      ['MINIMAP', 'EXPANDED'],
      ['CHAT TIMESTAMPS', 'OFF'],
      ['TOOLTIP DELAY', 'SHORT'],
      ['ITEM LABELS', 'ON'],
      ['UI SAFE AREA', 'AUTO'],
    ] as const : [
      ['REDUCED MOTION', 'OFF'],
      ['FLASH REDUCTION', 'OFF'],
      ['HIGH CONTRAST', 'OFF'],
      ['CHAT TEXT SIZE', 'NORMAL'],
      ['COLOUR FILTER', 'NONE'],
      ['HOLD ASSIST', 'OFF'],
    ] as const;
    const visibleRows = view.settingsTab === 'video' && compactVideoRows(settingsContent.height)
      ? settingRows.filter(([label]) => label === 'LIGHTING' || label === 'WORLD SCALE' || label === '30 HZ CAP') : settingRows;
    const rowHeight = view.settingsTab === 'video' ? videoSettingsRowHeight(settingsContent.height)
      : Math.max(14, Math.min(27, Math.floor((settingsContent.height - 38) / visibleRows.length)));
    visibleRows.forEach(([label, value], index) => {
      const y = settingsContent.y + 23 + index * rowHeight;
      drawPixelTextInRect(context, view.fonts, label, {
        x: settingsContent.x + 10, y, width: Math.max(40, settingsContent.width * 0.46), height: Math.min(18, rowHeight),
      }, { verticalAlign: 'center', color: '#6b4428', overflow: 'ellipsis' });
      const interactiveLightingModel = view.settingsTab === 'video' && label === 'LIGHTING';
      const interactiveWorldScale = view.settingsTab === 'video' && label === 'WORLD SCALE';
      const interactiveCap = view.settingsTab === 'video' && label === '30 HZ CAP';
      drawMenuButton(context, view.skin, view.fonts, view.pointer, interactiveLightingModel
        ? view.lightingQualityNode.bounds : interactiveWorldScale ? view.worldScaleNode.bounds : interactiveCap ? view.presentationCapNode.bounds : {
        x: settingsContent.x + Math.floor(settingsContent.width * 0.5), y,
        width: Math.max(40, settingsContent.width * 0.5 - 10), height: Math.min(18, rowHeight),
      }, value, { tone: interactiveLightingModel || interactiveWorldScale || interactiveCap ? 'green' : 'silver', disabled: !interactiveLightingModel && !interactiveWorldScale && !interactiveCap });
    });
    const lightingHint = lightingSettingsMode(view.model) === 'dynamic' && view.model.lightingEffectsDisabled
      ? view.model.lightingFallbackReason === 'preparing' ? 'PREPARING DYNAMIC LIGHTING...' : 'DYNAMIC UNAVAILABLE; USING BASIC'
      : 'CLICK LIGHTING: BASIC / CLASSIC / DYNAMIC';
    const backend = worldBackendStatus();
    if (view.settingsTab === 'video' && backend.fallbackReason !== null) {
      const top = settingsContent.y + 23 + visibleRows.length * rowHeight + 3;
      drawBackendReason(context, view.fonts, backend.fallbackReason, {
        x: settingsContent.x + 10, y: top, width: settingsContent.width - 20,
        height: settingsContent.y + settingsContent.height - 7 - top,
      });
      return;
    }
    const videoHint = backend.preparing ? 'PREPARING EXPERIMENTAL WEBGL...' : backend.backend === 'webgl2' ? 'EXPERIMENTAL WEBGL ACTIVE'
        : lightingHint;
    drawPixelTextInRect(context, view.fonts, view.settingsTab === 'video' ? videoHint : 'CONFIGURATION SUPPORT IS RESERVED FOR A LATER UPDATE.', {
      x: settingsContent.x + 10,
      y: settingsContent.y + settingsContent.height - 17,
      width: settingsContent.width - 20,
      height: 10,
    }, { align: 'center', color: '#8c6c54', overflow: 'ellipsis' });
}
