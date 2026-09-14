import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { nearestInteractionCandidate } from './interaction-targeting.js';

it('routes the actual E/touch activation handler to the private cache reducer and explains shared contents', () => {
  const source = ts.createSourceFile('overworld-main.ts', readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'activateInteraction');
  if (declaration === undefined) throw new Error('Missing production activation handler');
  const openHearthSupplyCache = vi.fn(() => Promise.resolve()), openHearthStash = vi.fn(() => Promise.resolve()), showResult = vi.fn();
  const code = ts.transpileModule(declaration.getText(source) + '\nreturn activateInteraction;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const activate = new Function('network', 'showResult', code)({ openHearthSupplyCache, openHearthStash }, showResult);
  activate({ kind: 'hearth_supply_cache' }, {});
  expect(openHearthSupplyCache).toHaveBeenCalledExactlyOnceWith();
  expect(openHearthStash).not.toHaveBeenCalled();
  expect(showResult.mock.calls[0]?.[1]).toBe('PERSONAL STASH: SHARED WITH DELVE LOBBY');
  activate({ kind: 'hearth_stash' }, {});
  expect(openHearthStash).toHaveBeenCalledExactlyOnceWith();
});

it('keeps supply interaction in the normal nearest-target ordering', () => {
  const cache = { kind: 'hearth_supply_cache' as const, x: 0, y: 0, stableId: 'hearth:personal-supply-cache' };
  const ferry = { kind: 'ferry' as const, x: 10, y: 0, stableId: 'ferry:cinder' };
  expect(nearestInteractionCandidate(0, 0, [cache, ferry])).toBe(cache);
  expect(nearestInteractionCandidate(10, 0, [cache, ferry])).toBe(ferry);
});
