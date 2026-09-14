import { describe, expect, it } from 'vitest';
import {
  TOOL_MERCHANT_DIALOGUE, dialogueChoice, dialogueDefinition, dialogueNode,
  runtimeDialogueDefinition,
} from './dialogue.js';
import { bootstrapContentRows } from './content/bootstrap-registry.js';
import { buildContentRegistry } from './content/registry.js';

describe('reusable NPC dialogue definitions', () => {
  it('resolves definitions through the shared registry', () => {
    expect(dialogueDefinition('tool_merchant')).toBe(TOOL_MERCHANT_DIALOGUE);
    expect(dialogueDefinition('missing')).toBeNull();
  });

  it('projects dialogue authority from a published live revision', () => {
    const rows = bootstrapContentRows().map((row) => row.id !== 'dialogue:tool_merchant' ? row : {
      ...row,
      json: JSON.stringify({
        ...(JSON.parse(String(row.json)) as object), initialNodeId: 'about_trade',
      }),
    });
    const registry = buildContentRegistry(rows).registry;
    expect(runtimeDialogueDefinition(registry, 'tool_merchant')?.initialNodeId).toBe('about_trade');
    expect(runtimeDialogueDefinition(registry, 'missing')).toBeNull();
  });

  it('offers a filterable quest chain plus the reusable route into the shop', () => {
    const greeting = dialogueNode(TOOL_MERCHANT_DIALOGUE, TOOL_MERCHANT_DIALOGUE.initialNodeId);
    expect(greeting?.choices.length).toBeGreaterThan(4);
    expect(dialogueChoice(TOOL_MERCHANT_DIALOGUE, 'greeting', 'quest_offer')).toMatchObject({
      questMarker: 'offer',
      quest: { questId: 'marlow_important_book', requires: 'available' },
    });
    expect(dialogueChoice(TOOL_MERCHANT_DIALOGUE, 'quest_request', 'accept')).toMatchObject({
      tone: 'accept', quest: { action: 'accept' },
    });
    expect(dialogueChoice(TOOL_MERCHANT_DIALOGUE, 'quest_request', 'decline')?.tone).toBe('decline');
    expect(dialogueChoice(TOOL_MERCHANT_DIALOGUE, 'greeting', 'quest_complete')).toMatchObject({
      label: 'I found your book.', questMarker: 'complete', quest: { action: 'turn_in' },
    });
    expect(dialogueChoice(TOOL_MERCHANT_DIALOGUE, 'greeting', 'offer')?.nextNodeId).toBe('shop');
    expect(dialogueChoice(TOOL_MERCHANT_DIALOGUE, 'about_trade', 'deeds')?.nextNodeId).toBe('about_deeds');
    expect(dialogueNode(TOOL_MERCHANT_DIALOGUE, 'about_deeds')?.body).toContain('press F');
    expect(dialogueNode(TOOL_MERCHANT_DIALOGUE, 'shop')?.mode).toBe('shop');
  });

  it('treats a null transition as a clean dialogue close', () => {
    expect(dialogueChoice(TOOL_MERCHANT_DIALOGUE, 'greeting', 'goodbye')?.nextNodeId).toBeNull();
    expect(dialogueChoice(TOOL_MERCHANT_DIALOGUE, 'greeting', 'missing')).toBeNull();
  });
});
