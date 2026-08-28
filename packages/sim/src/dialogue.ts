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
        { id: 'quest_complete', label: 'I found your book. (Reward: 1 gold)', nextNodeId: 'quest_rewarded', questMarker: 'complete', quest: { questId: 'marlow_important_book', requires: 'complete', action: 'turn_in' } },
        { id: 'quest_offer', label: 'Hey you, yes you, I need your help.', nextNodeId: 'quest_request', questMarker: 'offer', quest: { questId: 'marlow_important_book', requires: 'available' } },
        { id: 'quest_active', label: 'About that very important book...', nextNodeId: 'quest_reminder', quest: { questId: 'marlow_important_book', requires: 'active' } },
        { id: 'offer', label: 'Let me see what you have to offer.', nextNodeId: 'shop' },
        { id: 'trade', label: 'What do you trade?', nextNodeId: 'about_trade' },
        { id: 'island', label: 'What have you seen on the island?', nextNodeId: 'about_island' },
        { id: 'goodbye', label: 'Goodbye.', nextNodeId: null },
      ],
    },
    quest_request: {
      id: 'quest_request',
      speaker: 'Marlow',
      body: 'There\'s a very important book I need, and I am far too old to take the journey to fetch it. Will you help an old man out?',
      mode: 'dialogue',
      choices: [
        { id: 'where', label: 'Where is the book?', nextNodeId: 'quest_where' },
        { id: 'accept', label: 'Of course. I\'ll fetch it.', nextNodeId: 'quest_accepted', tone: 'accept', quest: { questId: 'marlow_important_book', requires: 'available', action: 'accept' } },
        { id: 'decline', label: 'No, I have other things to do.', nextNodeId: 'quest_declined', tone: 'decline' },
      ],
    },
    quest_where: {
      id: 'quest_where',
      speaker: 'Marlow',
      body: 'It\'s just in the tent over there, on the table in the corner.',
      mode: 'dialogue',
      choices: [
        { id: 'really', label: 'Really? It\'s just over there though...', nextNodeId: 'quest_insists' },
        { id: 'accept', label: 'All right. I\'ll get it.', nextNodeId: 'quest_accepted', tone: 'accept', quest: { questId: 'marlow_important_book', requires: 'available', action: 'accept' } },
        { id: 'decline', label: 'You can manage that yourself.', nextNodeId: 'quest_declined', tone: 'decline' },
      ],
    },
    quest_insists: {
      id: 'quest_insists',
      speaker: 'Marlow',
      body: 'Yes, just there. But it is an exceptionally important journey, and I have an exceptionally important fire to watch.',
      mode: 'dialogue',
      choices: [
        { id: 'accept', label: 'Fine. I accept.', nextNodeId: 'quest_accepted', tone: 'accept', quest: { questId: 'marlow_important_book', requires: 'available', action: 'accept' } },
        { id: 'decline', label: 'Absolutely not.', nextNodeId: 'quest_declined', tone: 'decline' },
      ],
    },
    quest_accepted: {
      id: 'quest_accepted', speaker: 'Marlow',
      body: 'Splendid. You\'ll find it on the table inside my tent. Mind the dimensional threshold.',
      mode: 'dialogue',
      choices: [{ id: 'goodbye', label: 'I\'ll be right back.', nextNodeId: null }],
    },
    quest_declined: {
      id: 'quest_declined', speaker: 'Marlow', body: 'Fair enough then. The tent is not getting any farther away.', mode: 'dialogue',
      choices: [{ id: 'back', label: 'I had another question.', nextNodeId: 'greeting' }, { id: 'goodbye', label: 'Goodbye.', nextNodeId: null }],
    },
    quest_reminder: {
      id: 'quest_reminder', speaker: 'Marlow', body: 'The book is on the table in my tent. Yes, that tent. The one right over there.', mode: 'dialogue',
      choices: [{ id: 'goodbye', label: 'Right. I\'ll go get it.', nextNodeId: null }],
    },
    quest_rewarded: {
      id: 'quest_rewarded', speaker: 'Marlow',
      body: 'Thanks... Oh, wait, I\'ve already read this one. Here, you keep it. Take 1 gold for the trouble, too.',
      mode: 'dialogue',
      choices: [{ id: 'goodbye', label: 'Thanks, Marlow.', nextNodeId: null }],
    },
    about_trade: {
      id: 'about_trade',
      speaker: 'Marlow',
      body: 'Tools, lights, arrows, and honest coin for anything useful you bring me. Gold, silver, and bronze stay safely in your purse.',
      mode: 'dialogue',
      choices: [
        { id: 'offer', label: 'Let me see what you have to offer.', nextNodeId: 'shop' },
        { id: 'deeds', label: 'How do homestead deeds work?', nextNodeId: 'about_deeds' },
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
    about_deeds: {
      id: 'about_deeds',
      speaker: 'Marlow',
      body: 'Buy a deed here, select it on your hotbar, aim at a clear patch of overworld grass, and press F. That claims your homestead. Use the tent entrance to visit it and the south gate to return.',
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
