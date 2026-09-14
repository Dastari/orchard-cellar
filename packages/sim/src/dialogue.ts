import { bootstrapDefinitionsOfKind } from './content/bootstrap-pack-loader.js';
import type { DialogueContentDefinition } from './content/npc-definition.js';
import type { ContentRegistry } from './content/registry.js';

export interface DialogueChoice {
  readonly id: string;
  readonly label: string;
  readonly nextNodeId: string | null;
  readonly tone?: 'normal' | 'accept' | 'decline';
  readonly questMarker?: 'offer' | 'complete';
  readonly quest?: {
    readonly questId: string;
    readonly requires: 'available' | 'active' | 'complete' | 'turned_in';
    readonly action?: 'accept' | 'turn_in';
  };
}

export interface DialogueNode {
  readonly id: string;
  readonly speaker: string;
  readonly body: string;
  readonly mode: 'dialogue' | 'shop';
  readonly frameId?: `frame:${string}`;
  readonly choices: readonly DialogueChoice[];
}

export interface DialogueDefinition {
  readonly id: string;
  readonly initialNodeId: string;
  readonly nodes: Readonly<Record<string, DialogueNode>>;
}

export function dialogueDefinitionFromContent(definition: DialogueContentDefinition): DialogueDefinition {
  return {
    id: definition.id.slice('dialogue:'.length),
    initialNodeId: definition.initialNodeId,
    nodes: Object.fromEntries(definition.nodes.map((node) => [node.id, {
      ...node,
      choices: node.choices.map((choice): DialogueChoice => {
        const { quest, ...shared } = choice;
        return {
          ...shared,
          ...(quest === undefined ? {} : { quest: {
            questId: quest.quest.slice('quest:'.length),
            requires: quest.requires,
            ...(quest.action === undefined ? {} : { action: quest.action }),
          } }),
        };
      }),
    }])),
  };
}

export const DIALOGUE_DEFINITIONS: Readonly<Record<string, DialogueDefinition>> = Object.freeze(
  Object.fromEntries(bootstrapDefinitionsOfKind('dialogue').map((definition) => {
    const projected = dialogueDefinitionFromContent(definition);
    return [projected.id, projected];
  })),
);
export const TOOL_MERCHANT_DIALOGUE = DIALOGUE_DEFINITIONS.tool_merchant!;
export const FARMER_BOB_DIALOGUE = DIALOGUE_DEFINITIONS.farmer_bob!;
export const FISHERMAN_FIN_DIALOGUE = DIALOGUE_DEFINITIONS.fisherman_fin!;

export function dialogueDefinition(dialogueId: string): DialogueDefinition | null {
  return DIALOGUE_DEFINITIONS[dialogueId] ?? null;
}

/** Resolves dialogue from the verified live registry instead of the process
 * bootstrap snapshot used by compatibility fixtures and older UI callers. */
export function runtimeDialogueDefinition(
  registry: ContentRegistry,
  dialogueId: string,
): DialogueDefinition | null {
  const definition = registry.dialogues.get(`dialogue:${dialogueId}`);
  return definition === undefined || definition.retired === true
    ? null : dialogueDefinitionFromContent(definition);
}

export function dialogueNode(definition: DialogueDefinition, nodeId: string): DialogueNode | null {
  return definition.nodes[nodeId] ?? null;
}

export function dialogueChoice(definition: DialogueDefinition, nodeId: string, choiceId: string): DialogueChoice | null {
  return dialogueNode(definition, nodeId)?.choices.find((choice) => choice.id === choiceId) ?? null;
}
