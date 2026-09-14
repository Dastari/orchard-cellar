import { HOTBAR_SLOT_COUNT } from '@orchard/sim';
import { touchControlLayout } from '../touch-control-layout.js';

/** Positions the kit HUD surfaces in the game's logical viewport.
 * Modal geometry belongs exclusively to its kit composition. */
export function gameHudLayout(width: number, height: number) {
  const compactHotbar = width < 420;
  const hotbarColumns = compactHotbar ? Math.min(5, HOTBAR_SLOT_COUNT) : HOTBAR_SLOT_COUNT;
  const hotbarRows = Math.ceil(HOTBAR_SLOT_COUNT / hotbarColumns);
  const hotbarWidth = hotbarColumns * 30 - 2;
  const hotbarHeight = hotbarRows * (31 + 2) - 2;
  const centeredHotbarX = Math.round((width - hotbarWidth) / 2);
  const currencyWidth = Math.min(112, Math.max(94, width - centeredHotbarX - hotbarWidth - 6));
  const currencyFitsBeside = hotbarWidth + currencyWidth + 44 <= width;
  const hotbar = { x: currencyFitsBeside ? Math.min(centeredHotbarX, width - currencyWidth - 12 - hotbarWidth) : centeredHotbarX,
    y: height - hotbarHeight - 6, width: hotbarWidth, height: hotbarHeight };
  const vitals = {
    x: hotbar.x, y: hotbar.y - 19 - 4,
    width: 48, height: 19,
  };
  const targetVitals = {
    x: hotbar.x + hotbar.width - 48, y: vitals.y,
    width: 48, height: 19,
  };
  const status = { x: 4, y: 2, width: Math.max(0, Math.min(220, width - 128)), height: 34 };
  const watchStatus = {
    x: status.x,
    y: status.y + status.height + 2,
    width: status.width,
    height: 18,
  };
  const currency = {
    x: width - currencyWidth - 6,
    y: currencyFitsBeside ? height - 32 : Math.max(58, hotbar.y - 19 - 54),
    width: currencyWidth,
    height: 26,
  };
  const touch = touchControlLayout(width, height);
  const craftingY = hotbar.x - 28 < touch.joystickCenter.x + touch.joystickRadius
    ? Math.max(4, touch.joystickCenter.y - touch.joystickRadius - 28)
    : hotbar.y + Math.round((Math.min(31, hotbar.height) - 24) / 2);
  return {
    hotbar, vitals, targetVitals, status, watchStatus, currency,
    mobileMenuButton: { x: 4, y: 58, width: 44, height: 24 },
    craftingButton: { x: Math.max(4, hotbar.x - 28), y: craftingY, width: 24, height: 24 },
    collapsedZoneTab: { x: 0, y: 4, width: 32, height: 16 },
    minimap: { x: width - 120, y: 4, width: 116, height: 92 },
    collapsedMinimapTab: { x: width - 32, y: 4, width: 32, height: 16 },
    notification: { x: Math.round(width / 2) - 100, y: Math.max(32, vitals.y - 40), width: 200, height: 16 },
  };
}
