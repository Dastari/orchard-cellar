import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function sourceBetween(startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('merchant cart authority', () => {
  it('exposes bounded parallel-array cart reducers without trusting client totals', () => {
    const commerce = sourceBetween('function merchantCartLines(', '/** Axe strikes break');
    expect(commerce).toContain("itemKinds: t.array(t.string())");
    expect(commerce).toContain('quantities: t.array(t.u16())');
    expect(commerce).toContain('itemKinds.length > MAX_MERCHANT_CART_LINES');
    expect(commerce).not.toContain('totalBronze: t.');
    expect(commerce).toContain('planMerchantPurchase(inventory.containers, lines)');
    expect(commerce).toContain('planMerchantSale(inventory.containers, lines)');
  });

  it('removes authoritative inventory before crediting a mixed sale', () => {
    const sale = sourceBetween('function sellMerchantCartTransaction(', 'export const buyMerchantItem =');
    expect(sale.indexOf('planMerchantSale(inventory.containers, lines)'))
      .toBeLessThan(sale.indexOf('writePlayerInventory('));
    expect(sale.indexOf('writePlayerInventory('))
      .toBeLessThan(sale.indexOf('player_wallet.identity.update'));
    expect(sale).toContain("throw new SenderError(planned.code)");
    expect(sale).toContain("throw new SenderError('wallet_full')");
  });

  it('uses the authority-computed purchase total for both debit and statistics', () => {
    const purchase = sourceBetween('function purchaseMerchantCart(', '/** Sales remove');
    expect(purchase).toContain('wallet.balanceBronze < planned.totalBronze');
    expect(purchase).toContain('wallet.balanceBronze - planned.totalBronze');
    expect(purchase).toContain("'bronze_spent', planned.totalBronze");
    expect(purchase.indexOf('planMerchantPurchase(inventory.containers, lines)'))
      .toBeLessThan(purchase.indexOf('writePlayerInventory('));
  });

  it('keeps legacy single-item reducers on the same cart authority path', () => {
    const reducers = sourceBetween('export const buyMerchantItem =', '/** Axe strikes break');
    expect(reducers).toContain('purchaseMerchantCart(ctx, [line])');
    expect(reducers).toContain('sellMerchantCartTransaction(ctx, [line])');
    expect(reducers.match(/requireAuthorizedSender/g)).toHaveLength(4);
  });
});
