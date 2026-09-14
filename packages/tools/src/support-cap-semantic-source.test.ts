import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('support-cap semantic source boundary', () => {
  it('does not select support limits by exact balance definition id', () => {
    const source = [
      '../../sim/src/content/balance-definition.ts',
      '../../world/src/admin/auth-policy.ts',
      '../../world/src/admin/support-caps.ts',
    ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
    expect(source).not.toContain('SUPPORT_CAP_BALANCE_IDS');
    expect(source).not.toContain('balance:admin_support_');
  });
});
