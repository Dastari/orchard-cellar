import { schemaFormsSpecimen } from './specimens/schema-forms.js';
import { diagnosticsSpecimen } from './specimens/diagnostics.js';
import { workbenchSpecimen } from './specimens/workbench.js';
import { migrationSpecimens } from './specimens/migration.js';
import type { FrameContentDefinition } from '@orchard/sim';
import type { UiFrameDesignerModel } from '../runtime/frame-designer.js';
import { frameDesignerSpecimen } from './specimens/frame-designer.js';
import { authoredSpecimen } from './specimens/authored.js';
import { inventorySpecimen } from './specimens/inventory.js';
import { booksSpecimen } from './specimens/books.js';
import { anchorsSpecimen, touchSpecimen } from './specimens/anchors.js';
import { formsSpecimen, fieldsSpecimen } from './specimens/forms.js';
import { dataSpecimen } from './specimens/data.js';
import { patternsSpecimen, compositionPatternsSpecimen } from './specimens/patterns.js';
import { feedbackSpecimen } from './specimens/feedback.js';
import type { UiLabActor } from './actors.js';
import { actorsSpecimen } from './specimens/actors.js';
import type { LoadedAsset } from '../../assets.js';
import type { UiElement } from '../runtime/element.js';
import type { UiKitArt } from '../components/art.js';
import type { UiFactory } from '../components/index.js';
import { furnaceSpecimen } from './specimens/furnace.js';
import { foundationsSpecimen } from './specimens/foundations.js';
import { framesSpecimen } from './specimens/frames.js';
import { controlsSpecimen } from './specimens/controls.js';
export type UiLabDistrict = 'inventory' | 'books' | 'frame-designer' | 'forms' | 'patterns' | 'feedback' | 'foundations' | 'frames' | 'controls' | 'actors' | 'playground' | 'migration' | 'authored';
export interface UiLabMocks {
  readonly frameDefinitions?: readonly FrameContentDefinition[];
  readonly createFrameDesigner?: (definition: FrameContentDefinition) => UiFrameDesignerModel;
  readonly art?: UiKitArt;
  readonly activate: (id: string) => void;
  readonly actors?: readonly UiLabActor[];
  readonly requestAsset?: (name: string) => void;
  readonly assets?: ReadonlyMap<string, LoadedAsset>;
}
export interface UiLabSpecimen {
  readonly id: string; readonly title: string; readonly district: UiLabDistrict;
  readonly size: { readonly width: number; readonly height: number } | 'content';
  readonly closable?: boolean; readonly matrix?: Readonly<Record<string, readonly unknown[]>>;
  readonly build: (ui: UiFactory, props: Readonly<Record<string, unknown>>, mock: UiLabMocks) => UiElement;
}
export const UI_LAB_SPECIMENS: readonly UiLabSpecimen[] = [schemaFormsSpecimen, foundationsSpecimen, framesSpecimen, controlsSpecimen, furnaceSpecimen, actorsSpecimen, formsSpecimen, fieldsSpecimen, dataSpecimen, patternsSpecimen, compositionPatternsSpecimen, workbenchSpecimen, feedbackSpecimen, inventorySpecimen, booksSpecimen, anchorsSpecimen, touchSpecimen, authoredSpecimen, frameDesignerSpecimen, ...migrationSpecimens, diagnosticsSpecimen];
export function uiLabVariants(specimen: UiLabSpecimen): Readonly<Record<string, unknown>>[] {
  let variants: Readonly<Record<string, unknown>>[] = [{}];
  for (const [key, values] of Object.entries(specimen.matrix ?? {})) variants = variants.flatMap(props => values.map(value => ({ ...props, [key]: value })));
  return variants;
}
