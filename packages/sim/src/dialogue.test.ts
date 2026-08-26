import { describe, expect, it } from 'vitest';
import { TOOL_MERCHANT_DIALOGUE, dialogueChoice, dialogueDefinition, dialogueNode } from './dialogue.js';

describe('reusable NPC dialogue definitions', () => {
  it('resolves definitions through the shared registry', () => {
    expect(dialogueDefinition('tool_merchant')).toBe(TOOL_MERCHANT_DIALOGUE);
    expect(dialogueDefinition('missing')).toBeNull();
  });

  it('offers mouse/key-sized option lists and a route into the shop', () => {
    const greeting = dialogueNode(TOOL_MERCHANT_DIALOGUE, TOOL_MERCHANT_DIALOGUE.initialNodeId);
    expect(greeting?.choices).toHaveLength(4);
    expect(greeting?.choices[0]?.label).toBe('Let me see what you have to offer.');
    expect(dialogueChoice(TOOL_MERCHANT_DIALOGUE, 'greeting', 'offer')?.nextNodeId).toBe('shop');
    expect(dialogueNode(TOOL_MERCHANT_DIALOGUE, 'shop')?.mode).toBe('shop');
  });

  it('treats a null transition as a clean dialogue close', () => {
    expect(dialogueChoice(TOOL_MERCHANT_DIALOGUE, 'greeting', 'goodbye')?.nextNodeId).toBeNull();
    expect(dialogueChoice(TOOL_MERCHANT_DIALOGUE, 'greeting', 'missing')).toBeNull();
  });
});
