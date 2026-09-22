/** Editor entry: keep the reviewed kit and UI Lab out of the game graph. */
export * from './index.js';
export * from './kit/index.js';
export * from './studio/spatial-art.js';

// Explicit F1 public API; retained when the Studio kit gate narrows this barrel.
export { uiSchemaForm, uiArrayEditor, UiSchemaFormState, type UiSchemaFormOptions } from './kit/components/schema-form.js';
export { uiReferencePicker, uiUsedBy, type UiContentReference, type UiReferencePickerOptions } from './kit/components/reference-picker.js';
