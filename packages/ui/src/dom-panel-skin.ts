import { loadGeneratedAsset, type LoadedAsset } from './assets.js';
import { drawUiSkinAsset } from './skin.js';

export interface DomPanelSkin {
  readonly wood: LoadedAsset;
  readonly parchment: LoadedAsset;
}

export interface MountedDomPanel {
  dispose(): void;
}

let panelSkinPromise: Promise<DomPanelSkin> | null = null;

/** Loads the same generated panel assets used by the in-game and editor Canvas UI. */
export async function loadDomPanelSkin(): Promise<DomPanelSkin> {
  panelSkinPromise ??= Promise.all([
    loadGeneratedAsset('ui_cf_panel_wood', 'summer'),
    loadGeneratedAsset('ui_cf_panel_parchment', 'summer'),
  ]).then(([wood, parchment]) => ({ wood, parchment }));
  return await panelSkinPromise;
}

/**
 * Paints an infrequently changing generated nine-slice skin behind DOM
 * content. The retained Canvas only redraws on resize; controls remain real
 * DOM elements with normal focus and accessibility semantics.
 */
export function mountDomPanelSkin(
  element: HTMLElement,
  skin: DomPanelSkin,
  inset = 8,
): MountedDomPanel {
  const canvas = document.createElement('canvas');
  canvas.className = 'dev-skinned-panel__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  element.classList.add('dev-skinned-panel');
  element.prepend(canvas);
  const contextValue = canvas.getContext('2d');
  if (contextValue === null) throw new Error('DOM panel Canvas 2D unavailable');
  const context: CanvasRenderingContext2D = contextValue;

  function draw(): void {
    const width = Math.max(1, element.clientWidth);
    const height = Math.max(1, element.clientHeight);
    const dpr = Math.max(1, Math.min(2, devicePixelRatio));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, height);
    drawUiSkinAsset(context, skin.wood, { x: 0, y: 0, width, height });
    drawUiSkinAsset(context, skin.parchment, {
      x: inset,
      y: inset,
      width: Math.max(1, width - inset * 2),
      height: Math.max(1, height - inset * 2),
    });
  }

  const observer = new ResizeObserver(draw);
  observer.observe(element);
  draw();
  return {
    dispose(): void {
      observer.disconnect();
      canvas.remove();
      element.classList.remove('dev-skinned-panel');
    },
  };
}
