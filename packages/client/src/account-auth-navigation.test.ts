import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const accountMain = readFileSync(new URL('./account-main.ts', import.meta.url), 'utf8');

describe('account authentication navigation', () => {
  it('uses the full-page PKCE flow so managed previews are not stranded in a popup', () => {
    expect(accountMain).toContain('beginOidcLogin,');
    expect(accountMain).toContain('await beginOidcLogin(intent);');
    expect(accountMain).not.toContain('beginOidcPopupLogin');
  });
});
