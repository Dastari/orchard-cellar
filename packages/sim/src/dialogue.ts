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
        { id: 'quest_complete', label: 'I found your book.', nextNodeId: 'quest_rewarded', questMarker: 'complete', quest: { questId: 'marlow_important_book', requires: 'complete', action: 'turn_in' } },
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
    bottle_request: {
      id: 'bottle_request', speaker: 'Marlow',
      body: 'A working estate needs a product worth returning for. Press three pieces of fruit into Must, age that Must in a Fermentation Cask, then sell me the finished Bottle. You can use any stations you already own. Establish a homestead before you return and I will expand its grounds.',
      mode: 'dialogue',
      choices: [
        { id: 'accept', label: 'I will make the first Bottle.', nextNodeId: 'bottle_accepted', tone: 'accept', quest: { questId: 'marlow_first_bottle', requires: 'available', action: 'accept' } },
        { id: 'decline', label: 'Not yet.', nextNodeId: 'greeting', tone: 'decline' },
      ],
    },
    bottle_accepted: {
      id: 'bottle_accepted', speaker: 'Marlow',
      body: 'Good. Fruit Press to make Must and Pomace. Three Must go into the Fermentation Cask. Bring the Bottle to my shop when it is ready.',
      mode: 'dialogue',
      choices: [{ id: 'goodbye', label: 'Time to get to work.', nextNodeId: null }],
    },
    bottle_reminder: {
      id: 'bottle_reminder', speaker: 'Marlow',
      body: 'Press three Fruit, age the three Must into one Bottle, then sell the Bottle here. The Pomace is yours to reinvest elsewhere.',
      mode: 'dialogue',
      choices: [{ id: 'goodbye', label: 'I remember now.', nextNodeId: null }],
    },
    bottle_rewarded: {
      id: 'bottle_rewarded', speaker: 'Marlow',
      body: 'There it is: fruit into craft, craft into coin, coin into the estate. I have expanded your homestead grounds. Build on them wisely.',
      mode: 'dialogue',
      choices: [{ id: 'goodbye', label: 'This is only the beginning.', nextNodeId: null }],
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
      body: 'I follow the safer paths, but even those change. Farmer Bob keeps a little holding to the south-east, around 382 east, 378 south. He knows more about soil than I ever will. Keep a lantern close after sunset and never trust a quiet cliff edge.',
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

export const FARMER_BOB_DIALOGUE: DialogueDefinition = {
  id: 'farmer_bob',
  initialNodeId: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting', speaker: 'Farmer Bob',
      body: 'Morning! Or afternoon. Jane says I lose track when the watering starts. What can I do for you?',
      mode: 'dialogue',
      choices: [
        { id: 'strawberry_complete', label: 'I brought Jane the strawberries.', nextNodeId: 'strawberry_rewarded', questMarker: 'complete', quest: { questId: 'farmer_bob_fast_strawberries', requires: 'complete', action: 'turn_in' } },
        { id: 'strawberry_offer', label: 'Do you need help on the farm?', nextNodeId: 'strawberry_request', questMarker: 'offer', quest: { questId: 'farmer_bob_fast_strawberries', requires: 'available' } },
        { id: 'strawberry_active', label: 'How do I grow those strawberries?', nextNodeId: 'strawberry_reminder', quest: { questId: 'farmer_bob_fast_strawberries', requires: 'active' } },
        { id: 'bottle_complete', label: 'I sold my first Bottle.', nextNodeId: 'bottle_rewarded', questMarker: 'complete', quest: { questId: 'marlow_first_bottle', requires: 'complete', action: 'turn_in' } },
        { id: 'bottle_offer', label: 'What can I make from the harvest?', nextNodeId: 'bottle_request', questMarker: 'offer', quest: { questId: 'marlow_first_bottle', requires: 'available' } },
        { id: 'bottle_active', label: 'Remind me about fruit production.', nextNodeId: 'bottle_reminder', quest: { questId: 'marlow_first_bottle', requires: 'active' } },
        { id: 'offer', label: 'What farming supplies do you sell?', nextNodeId: 'shop' },
        { id: 'jane', label: 'Tell me about Jane.', nextNodeId: 'about_jane' },
        { id: 'farm', label: 'How do you keep this place running?', nextNodeId: 'about_farm' },
        { id: 'grave', label: 'Whose grave is by the trees?', nextNodeId: 'about_grave' },
        { id: 'goodbye', label: 'Goodbye.', nextNodeId: null },
      ],
    },
    strawberry_request: {
      id: 'strawberry_request', speaker: 'Farmer Bob',
      body: 'Jane loves strawberries. I promised her some before supper, but the ordinary seeds take all day and she has never been patient. Take this special packet. Till a clear patch of grass with a hoe, plant the seeds, then water them once. They should be ready in about thirty seconds.',
      mode: 'dialogue',
      choices: [
        { id: 'accept', label: 'I will grow them for Jane.', nextNodeId: 'strawberry_accepted', tone: 'accept', quest: { questId: 'farmer_bob_fast_strawberries', requires: 'available', action: 'accept' } },
        { id: 'tools', label: 'What if I need farming tools?', nextNodeId: 'strawberry_tools' },
        { id: 'decline', label: 'Not just now.', nextNodeId: 'greeting', tone: 'decline' },
      ],
    },
    strawberry_tools: {
      id: 'strawberry_tools', speaker: 'Farmer Bob',
      body: 'I sell hoes, shovels, watering cans, and every ordinary seed I can get into a paper packet. These special strawberry seeds are for the job, though. Jane says selling miracles by the sack would ruin the market.',
      mode: 'dialogue',
      choices: [
        { id: 'accept', label: 'All right. I will grow them.', nextNodeId: 'strawberry_accepted', tone: 'accept', quest: { questId: 'farmer_bob_fast_strawberries', requires: 'available', action: 'accept' } },
        { id: 'shop', label: 'Show me your supplies first.', nextNodeId: 'shop' },
        { id: 'back', label: 'Maybe later.', nextNodeId: 'greeting' },
      ],
    },
    strawberry_accepted: {
      id: 'strawberry_accepted', speaker: 'Farmer Bob',
      body: 'Good! Till, plant, water once, and keep an eye on them. Bring me three strawberries. Jane will be delighted. She has been awfully quiet today.',
      mode: 'dialogue', choices: [{ id: 'goodbye', label: 'I will be back soon.', nextNodeId: null }],
    },
    strawberry_reminder: {
      id: 'strawberry_reminder', speaker: 'Farmer Bob',
      body: 'Find clear overworld grass, till it with a hoe, plant the special packet, and water once. Thirty seconds or so. Then bring three strawberries back. Do not worry if Jane does not come out to greet you. She rests a lot these days.',
      mode: 'dialogue',
      choices: [{ id: 'shop', label: 'I need farming supplies.', nextNodeId: 'shop' }, { id: 'goodbye', label: 'I understand.', nextNodeId: null }],
    },
    strawberry_rewarded: {
      id: 'strawberry_rewarded', speaker: 'Farmer Bob',
      body: 'Thanks, my wife will love these. Here was one of her favourite books on gardening. I am sure she will not mind; I have not seen her reading it much lately. It has her notes for presses, barrels, and cellar casks too.',
      mode: 'dialogue', choices: [{ id: 'goodbye', label: 'Thank you, Bob.', nextNodeId: null }],
    },
    bottle_request: {
      id: 'bottle_request', speaker: 'Farmer Bob',
      body: 'Jane wrote the whole chain down. Press three pieces of fruit into Must, age three Must in a Fermentation Cask, then sell the finished Bottle to Marlow. Do that and I will help mark out more room at your homestead.',
      mode: 'dialogue',
      choices: [
        { id: 'accept', label: 'I will produce a Bottle.', nextNodeId: 'bottle_accepted', tone: 'accept', quest: { questId: 'marlow_first_bottle', requires: 'available', action: 'accept' } },
        { id: 'decline', label: 'Not yet.', nextNodeId: 'greeting', tone: 'decline' },
      ],
    },
    bottle_accepted: {
      id: 'bottle_accepted', speaker: 'Farmer Bob',
      body: 'Fruit Press first, Fermentation Cask second, Marlow last. Jane underlined that last part twice. She never trusted him around an unpriced bottle.',
      mode: 'dialogue', choices: [{ id: 'goodbye', label: 'Time to get to work.', nextNodeId: null }],
    },
    bottle_reminder: {
      id: 'bottle_reminder', speaker: 'Farmer Bob',
      body: 'Press three Fruit, age the three Must into one Bottle, and sell it to Marlow. Jane\'s journal contains the station recipes if you read it from your inventory.',
      mode: 'dialogue', choices: [{ id: 'goodbye', label: 'I remember now.', nextNodeId: null }],
    },
    bottle_rewarded: {
      id: 'bottle_rewarded', speaker: 'Farmer Bob',
      body: 'A proper first vintage! Jane would say not to drink the profits. I have expanded your homestead grounds. She would have liked that too.',
      mode: 'dialogue', choices: [{ id: 'goodbye', label: 'Thank you, Bob.', nextNodeId: null }],
    },
    about_jane: {
      id: 'about_jane', speaker: 'Farmer Bob',
      body: 'Best gardener on the island. She could shame a seed into sprouting. I still set out two mugs at breakfast. Habit is just love with nowhere urgent to be.',
      mode: 'dialogue', choices: [{ id: 'back', label: 'I had another question.', nextNodeId: 'greeting' }, { id: 'goodbye', label: 'Take care, Bob.', nextNodeId: null }],
    },
    about_farm: {
      id: 'about_farm', speaker: 'Farmer Bob',
      body: 'Fence keeps the cows in, gate lets good sense out. I rotate the plots, water at the roots, and talk to the pumpkins. Jane says the pumpkins are the only ones listening properly.',
      mode: 'dialogue', choices: [{ id: 'shop', label: 'Show me your supplies.', nextNodeId: 'shop' }, { id: 'back', label: 'I had another question.', nextNodeId: 'greeting' }],
    },
    about_grave: {
      id: 'about_grave', speaker: 'Farmer Bob',
      body: 'Jane picked that spot herself. Said the morning sun was lovely under those trees. I keep the flowers fresh so she has something cheerful to look at while she rests.',
      mode: 'dialogue', choices: [{ id: 'back', label: 'I had another question.', nextNodeId: 'greeting' }, { id: 'goodbye', label: 'Goodbye, Bob.', nextNodeId: null }],
    },
    shop: {
      id: 'shop', speaker: 'Farmer Bob',
      body: 'Seeds in dry packets, tools by the handle. Jane did the labels. Mine always looked like frightened worms.',
      mode: 'shop', choices: [{ id: 'back', label: 'Back to our conversation.', nextNodeId: 'greeting' }, { id: 'goodbye', label: 'Goodbye.', nextNodeId: null }],
    },
  },
};

/** Shared registry used by both authority and presentation. Adding a future
 * NPC means registering another data definition; the dialogue UI and reducer
 * state machine do not need another bespoke window. */
export const DIALOGUE_DEFINITIONS: Readonly<Record<string, DialogueDefinition>> = {
  [TOOL_MERCHANT_DIALOGUE.id]: TOOL_MERCHANT_DIALOGUE,
  [FARMER_BOB_DIALOGUE.id]: FARMER_BOB_DIALOGUE,
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
