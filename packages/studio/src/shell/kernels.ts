import {
  buildStudioTableView,
  studioInspectorGroups,
  studioTabStrip,
  type StudioInspectorGroupModel,
  type StudioPropertyInput,
  type StudioTableColumn,
  type StudioTableRow,
  type StudioTableSort,
  type StudioTableView,
} from '@orchard/ui/studio';
import type { StudioCommandDefinition } from './tool-registry.js';

export interface StudioValidationIssue { readonly id: string; readonly severity: 'error' | 'warning' | 'info'; readonly message: string; readonly targetId?: string }

export class StudioValidationPanel {
  #issues: readonly StudioValidationIssue[] = [];
  setIssues(issues: readonly StudioValidationIssue[]): void { this.#issues = Object.freeze([...issues]); }
  issues(): readonly StudioValidationIssue[] { return this.#issues; }
  errorCount(): number { return this.#issues.filter(({ severity }) => severity === 'error').length; }
}

export class StudioInspectorKernel {
  #groups: readonly StudioInspectorGroupModel[] = [];
  inspect(properties: readonly StudioPropertyInput[]): void { this.#groups = studioInspectorGroups(properties); }
  groups(): readonly StudioInspectorGroupModel[] { return this.#groups; }
}

export class StudioTableKernel {
  view(input: { readonly columns: readonly StudioTableColumn[]; readonly rows: readonly StudioTableRow[]; readonly query?: string; readonly sort?: StudioTableSort | null; readonly selectedIds?: readonly string[] }): StudioTableView {
    return buildStudioTableView(input);
  }
}

export class StudioBottomDock {
  #active = 'validation';
  tabs(connected: boolean): ReturnType<typeof studioTabStrip> {
    return studioTabStrip([
      { id: 'validation', label: 'Validation' },
      { id: 'audit', label: 'Audit', disabled: !connected },
      { id: 'sync', label: 'Live Sync', disabled: !connected },
      { id: 'console', label: 'Console' },
    ], this.#active);
  }
  select(id: string): void { this.#active = id; }
}

export class StudioCommandPalette {
  #commands: readonly StudioCommandDefinition[] = [];
  setCommands(commands: readonly StudioCommandDefinition[]): void { this.#commands = Object.freeze([...commands]); }
  search(query: string): readonly StudioCommandDefinition[] {
    const needle = query.trim().toLocaleLowerCase('en');
    return Object.freeze(this.#commands.filter((command) => needle.length === 0 || [command.label, command.id, ...(command.keywords ?? [])]
      .some((value) => value.toLocaleLowerCase('en').includes(needle))));
  }
}
