export interface DialogueChoice {
  readonly id: string;
  readonly label: string;
  readonly nextNodeId: string | null;
}

export interface DialogueNode {
  readonly id: string;
  readonly speaker: string;
  readonly body: string;
  readonly mode: 'dialogue' | 'shop';
  readonly choices: readonly DialogueChoice[];
}

export interface DialogueDefinition {
  readonly id: string;
  readonly initialNodeId: string;
  readonly nodes: Readonly<Record<string, DialogueNode>>;
}

export const TOOL_MERCHANT_DIALOGUE: DialogueDefinition = {
  id: 'tool_merchant',
  initialNodeId: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting',
      speaker: 'Marlow',
      body: 'Well met, traveller. Tools wear out, supplies wander off, and I make sure neither keeps you down for long.',
      mode: 'dialogue',
      choices: [
        { id: 'offer', label: 'Let me see what you have to offer.', nextNodeId: 'shop' },
        { id: 'trade', label: 'What do you trade?', nextNodeId: 'about_trade' },
        { id: 'island', label: 'What have you seen on the island?', nextNodeId: 'about_island' },
        { id: 'goodbye', label: 'Goodbye.', nextNodeId: null },
      ],
    },
    about_trade: {
      id: 'about_trade',
      speaker: 'Marlow',
      body: 'Tools, lights, arrows, and honest coin for anything useful you bring me. Gold, silver, and bronze stay safely in your purse.',
      mode: 'dialogue',
      choices: [
        { id: 'offer', label: 'Let me see what you have to offer.', nextNodeId: 'shop' },
        { id: 'back', label: 'I had another question.', nextNodeId: 'greeting' },
        { id: 'goodbye', label: 'Goodbye.', nextNodeId: null },
      ],
    },
    about_island: {
      id: 'about_island',
      speaker: 'Marlow',
      body: 'I follow the safer paths, but even those change. Keep a lantern close after sunset and never trust a quiet cliff edge.',
      mode: 'dialogue',
      choices: [
        { id: 'offer', label: 'Let me see what you have to offer.', nextNodeId: 'shop' },
        { id: 'back', label: 'I had another question.', nextNodeId: 'greeting' },
        { id: 'goodbye', label: 'Goodbye.', nextNodeId: null },
      ],
    },
    shop: {
      id: 'shop',
      speaker: 'Marlow',
      body: 'Take your time. I buy useful goods as readily as I sell them.',
      mode: 'shop',
      choices: [
        { id: 'back', label: 'Back to our conversation.', nextNodeId: 'greeting' },
        { id: 'goodbye', label: 'Goodbye.', nextNodeId: null },
      ],
    },
  },
};

/** Shared registry used by both authority and presentation. Adding a future
 * NPC means registering another data definition; the dialogue UI and reducer
 * state machine do not need another bespoke window. */
export const DIALOGUE_DEFINITIONS: Readonly<Record<string, DialogueDefinition>> = {
  [TOOL_MERCHANT_DIALOGUE.id]: TOOL_MERCHANT_DIALOGUE,
};

export function dialogueDefinition(dialogueId: string): DialogueDefinition | null {
  return DIALOGUE_DEFINITIONS[dialogueId] ?? null;
}

export function dialogueNode(definition: DialogueDefinition, nodeId: string): DialogueNode | null {
  return definition.nodes[nodeId] ?? null;
}

export function dialogueChoice(definition: DialogueDefinition, nodeId: string, choiceId: string): DialogueChoice | null {
  return dialogueNode(definition, nodeId)?.choices.find((choice) => choice.id === choiceId) ?? null;
}
