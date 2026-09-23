import { studioInspectorGroups, type StudioInspectorGroupModel, type StudioPropertyInput } from './studio-models.js';
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

export class StudioCommandPalette {
  #commands: readonly StudioCommandDefinition[] = [];
  setCommands(commands: readonly StudioCommandDefinition[]): void { this.#commands = Object.freeze([...commands]); }
  search(query: string): readonly StudioCommandDefinition[] {
    const needle = query.trim().toLocaleLowerCase('en');
    return Object.freeze(this.#commands.filter((command) => needle.length === 0 || [command.label, command.id, ...(command.keywords ?? [])]
      .some((value) => value.toLocaleLowerCase('en').includes(needle))));
  }
}
