import type { UiRect } from '../../geometry.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiButton } from './button.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiViewport } from './viewport.js';

export interface UiInspectorLayer {
  readonly id: string;
  readonly label: string;
  readonly visible: boolean;
}
export interface UiLayerInspectorOptions {
  readonly id?: string;
  readonly layers: readonly UiInspectorLayer[];
  readonly selectedId: string | null;
  readonly layout?: UiStyle;
  /** A null layer selects the composite. Only spatial art belongs here. */
  readonly render: (context: CanvasRenderingContext2D, bounds: UiRect, layerId: string | null) => void;
  readonly onClose?: () => void;
  readonly onSelect: (id: string) => void;
  readonly onVisibility: (id: string, visible: boolean) => void;
}
export function uiLayerInspector(options: UiLayerInspectorOptions) {
  let model = options;
  const id = options.id ?? 'layer-inspector';
  const preview = (layerId: string | null, size: number) => uiViewport({
    id: `${id}.preview.${layerId ?? 'composite'}`, label: layerId === null ? 'Composed terrain' : `Layer ${layerId}`,
    background: 'checkerboard', layout: { width: uiFixed(size), height: uiFixed(size), shrink: 0 },
    render: (context, bounds) => model.render(context, bounds, layerId),
  });
  const composite = preview(null, 96);
  const scrollArea = uiScrollArea({ id: `${id}.scroll`, gap: 4, padding: { right: 8 } });
  scrollArea.focusable = true;
  const controls = new Map<string, { select: ReturnType<typeof uiButton>; visibility: ReturnType<typeof uiButton> }>();
  const rebuild = () => {
    controls.clear();
    scrollArea.replaceChildren([composite, ...model.layers.map(layer => {
      const select = uiButton({ id: `${id}.select.${layer.id}`, label: layer.label, size: 'md',
        layout: { width: 'grow' }, onPress: () => model.onSelect(layer.id) });
      const visibility = uiButton({ id: `${id}.visibility.${layer.id}`, label: '', size: 'md',
        layout: { width: 'grow' }, onPress: () => {
          const current = model.layers.find(entry => entry.id === layer.id);
          if (current) model.onVisibility(layer.id, !current.visible);
        } });
      controls.set(layer.id, { select, visibility });
      return uiFlex({ direction: 'row', wrap: true, gap: 4, width: 'grow', height: 'fit', shrink: 0 }, [
        preview(layer.id, 64), uiFlex({ width: 'grow', minWidth: uiFixed(88), height: 'fit', gap: 4 }, [select, visibility]),
      ]);
    })]);
  };
  const refresh = () => {
    for (const layer of model.layers) {
      const entry = controls.get(layer.id)!;
      entry.select.label = layer.label;
      entry.visibility.label = layer.visible ? 'VISIBLE' : 'HIDDEN';
      entry.select.setProps({ label: layer.label, tone: layer.id === model.selectedId ? 'primary' : 'neutral' });
      entry.visibility.setProps({ label: layer.visible ? 'VISIBLE' : 'HIDDEN', tone: layer.visible ? 'success' : 'muted' });
    }
  };
  rebuild(); refresh();
  const frame = uiFrame({ id, style: 'thin', tone: 'neutral', blockInput: true,
    header: { title: 'TERRAIN LAYERS', closable: Boolean(options.onClose), onClose: () => model.onClose?.() }, layout: { width: 'grow', height: 'grow', ...options.layout }, children: [scrollArea] });
  return Object.assign(frame, { scrollArea, updateInspector(next: UiLayerInspectorOptions) {
    const structureChanged = model.layers.length !== next.layers.length || model.layers.some((layer, index) => layer.id !== next.layers[index]?.id);
    model = next;
    if (structureChanged) rebuild();
    refresh();
  } });
}
