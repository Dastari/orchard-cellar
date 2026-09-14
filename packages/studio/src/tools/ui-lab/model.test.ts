import { describe, expect, it } from 'vitest';
import { createUiLabSnapshot, UI_LAB_TOOL_REGISTRATION } from './model.js';

describe('Studio UI Lab', () => {
  it('registers the Author route and renders the shared component catalog', () => {
    expect(UI_LAB_TOOL_REGISTRATION).toMatchObject({ id: 'ui-lab', routes: ['/author/ui-lab'] });
    expect(createUiLabSnapshot().specimens.length).toBeGreaterThan(0);
  });
});
