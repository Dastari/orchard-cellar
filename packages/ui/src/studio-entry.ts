/**
 * Editor entry: the reviewed UI kit surface and nothing else (doc 61 §5).
 *
 * Studio composes screens from `ui` factories. Kit types are exported as
 * types only, so `UiElement` can be named but not constructed here. Engine
 * painters (`draw*`), hand layout (`layoutUi*`) and the retired Studio shell
 * models are not reachable through this entry. When Studio needs something the
 * kit lacks, add it to the kit with a UI Lab specimen instead of widening this
 * list. The ESLint `orchard-ui-kit/*` rules enforce the same boundary in source.
 */
export type * from './kit/index.js';
export {
  ui, uiFixed, uiOffset, UiRoot, UiTextBridge,
  UiLabWorld, UI_LAB_SPECIMENS, UI_ICON_CATALOG,
  loadUiKitArt, createUiFrameDesignerModel,
  inspectUiElements, scrollUiElement,
} from './kit/index.js';

// Content loaders for spatial viewports and sprite previews.
export {
  loadGeneratedAsset, loadGeneratedAssetCatalog,
  type LoadedAsset, type GeneratedAssetCatalog, type BuiltAssetRecord,
} from './assets.js';
export { selectAtlasFrame, type AtlasFrame } from './sprite.js';
export { CanvasTextEditor } from './kit/runtime/text-editor.js';
export type { UiPoint, UiRect } from './geometry.js';
export { uiIconFileName, type UiIconName, type UiIconAsset } from './skin.js';

// Studio tokens, tool icon choices and the map viewport's spatial art.
export { STUDIO_SKIN_TOKENS } from './studio/skin.js';
export { studioToolIcon, STUDIO_TOOL_ICON_IDS, type StudioToolIconId } from './studio/tool-icons.js';
export * from './studio/spatial-art.js';

// Explicit F1 public API; retained when the Studio kit gate narrows this barrel.
export { uiSchemaForm, uiArrayEditor, UiSchemaFormState, type UiSchemaFormOptions } from './kit/components/schema-form.js';
export { uiReferencePicker, uiUsedBy, type UiContentReference, type UiReferencePickerOptions } from './kit/components/reference-picker.js';
