import type { FrameContentDefinition } from '@orchard/sim';
import type { UiFrameDesignerModel } from '../runtime/frame-designer.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiElement } from '../runtime/element.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';
import { uiTextArea } from './input.js';
import { uiSelect } from './select.js';
import { uiStepper } from './forms.js';
import { uiContentFrame, type UiContentFrameOptions } from './content-frame.js';
export interface UiFrameDesignerComponentOptions {
  readonly definitions: readonly FrameContentDefinition[];
  readonly createModel: (definition: FrameContentDefinition) => UiFrameDesignerModel;
  readonly preview: Omit<UiContentFrameOptions, 'definition' | 'onPaneSelect'>;
  readonly previewFor?: (definition: FrameContentDefinition) => Omit<UiContentFrameOptions, 'definition' | 'onPaneSelect'>;
  readonly onAction?: (action: string) => void;
  readonly layout?: UiStyle;
}
/** Draft edits stay in the model; only the explicit Publish action invokes its host adapter. */
export function uiFrameDesigner(options: UiFrameDesignerComponentOptions): UiElement {
  if (!options.definitions.length) return uiText('No frame definitions available.');
  let model = options.createModel(options.definitions[0]!), selected = '', draft = '', sequence = 0, publishing = false;
  const status = uiText('Local preview ready');
  const content = uiFlex({ width: 'grow', height: 'grow', gap: 8 });
  const report = (action: string, operation: () => void) => {
    try { operation(); rebuild(); status.setProps({ text: action }); options.onAction?.(action); }
    catch (error) { status.setProps({ text: error instanceof Error ? error.message : String(error) }); }
  };
  const rebuild = () => {
    const state = model.snapshot(), definition = state.definition, readOnly = state.access === 'read_only';
    const pane = definition.panes.find(pane => pane.id === selected) ?? definition.panes[0]; selected = pane?.id ?? '';
    draft = JSON.stringify(definition, null, 2);
    const editor = uiTextArea({ id: 'frame-designer-json', label: 'Frame definition JSON', value: draft, rows: 14, lineCount: true, readOnly, maxLength: 64000, layout: { height: 'grow' }, onChange: value => { draft = value; } });
    const controls = uiScrollArea({ width: 'grow', height: uiFixed(112), shrink: 0, gap: 4 }, [
      uiSelect({ label: 'Frame definition', value: definition.id, options: options.definitions.map(frame => ({ value: frame.id, label: frame.title })), onChange: id => report('Loaded frame', () => { model = options.createModel(options.definitions.find(frame => frame.id === id)!); selected = ''; }) }),
      uiText(`${state.access} | ${state.validation.valid ? 'Valid' : `${state.validation.errors.length} validation errors`} | ${state.dirty ? 'Draft changed' : 'Unchanged'}`),
      uiSelect({ label: 'Selected pane', value: selected, options: definition.panes.map(pane => ({ value: pane.id, label: pane.label ?? pane.id })), onChange: id => { selected = id; rebuild(); } }),
      ...(pane ? [uiFlex({ direction: 'row', wrap: true, gap: 4 }, [
        uiStepper({ label: 'Columns', value: pane.columns ?? 1, min: 1, max: 32, disabled: readOnly, onChange: value => report('Updated columns', () => { model.updatePaneGrid(selected, value, pane.rows ?? 1); }) }),
        uiStepper({ label: 'Rows', value: pane.rows ?? 1, min: 1, max: 32, disabled: readOnly, onChange: value => report('Updated rows', () => { model.updatePaneGrid(selected, pane.columns ?? 1, value); }) }),
        uiButton({ label: 'Move earlier', disabled: readOnly || definition.panes.indexOf(pane) === 0, onPress: () => report('Reordered pane', () => { model.movePane(selected, definition.panes.indexOf(pane) - 1); }) }),
        uiButton({ label: 'Move later', disabled: readOnly || definition.panes.indexOf(pane) === definition.panes.length - 1, onPress: () => report('Reordered pane', () => { model.movePane(selected, definition.panes.indexOf(pane) + 1); }) }),
      ])] : []),
    ]);
    const publish = uiButton({ label: publishing ? 'Publishing…' : 'Publish', tone: 'success', disabled: publishing || !state.canPublish, onPress: () => {
      publishing = true; rebuild();
      void model.publish(`frame.kit.${Date.now()}.${++sequence}`, 'Frame Designer edit').then(() => { status.setProps({ text: 'Published. Reload live definitions before another publish.' }); options.onAction?.('Published'); }, error => { status.setProps({ text: error instanceof Error ? error.message : String(error) }); }).finally(() => { publishing = false; rebuild(); });
    } });
    for (const child of content.children) child.dispose();
    content.replaceChildren([controls, uiFlex({ direction: 'row', wrap: true, gap: 8, width: 'grow', height: 'grow' }, [
      uiFlex({ width: 'grow', basis: uiFixed(260), height: 'grow', gap: 4 }, [editor, uiFlex({ direction: 'row', gap: 4 }, [uiButton({ label: 'Apply JSON', disabled: readOnly, onPress: () => report('Applied JSON', () => { model.replaceDefinition(draft); }) }), publish])]),
      uiContentFrame({ ...(options.previewFor?.(definition) ?? options.preview), definition, onPaneSelect: id => { selected = id; rebuild(); }, layout: { width: 'grow', basis: uiFixed(300), height: 'grow' } }),
    ])]);
  };
  rebuild();
  return uiFrame({ header: { title: 'Frame Designer' }, layout: { width: 'grow', height: 'grow', gap: 4, ...options.layout }, children: [content, status] });
}
