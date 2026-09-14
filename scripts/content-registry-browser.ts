import { bootstrapContentRows, buildContentRegistry } from '@orchard/sim';
import { BROWSER_REGISTRY_BUDGET_MS, measurementDefinitions, summarizeSamples } from './content-load-acceptance.js';

const rows = [...bootstrapContentRows(), ...measurementDefinitions()];
buildContentRegistry(rows);
const samples = Array.from({ length: 25 }, () => {
  const started = performance.now();
  const result = buildContentRegistry(rows);
  const duration = performance.now() - started;
  if (!result.report.valid) throw new Error(`browser_registry_invalid:${result.report.errors.length}`);
  return duration;
});
const summary = summarizeSamples(samples);
const passed = summary.p95 <= BROWSER_REGISTRY_BUDGET_MS;
const evidence = {
  schemaVersion: 1,
  runtime: navigator.userAgent,
  definitionCount: rows.length,
  samples: samples.length,
  budgetP95Ms: BROWSER_REGISTRY_BUDGET_MS,
  buildMs: summary,
  passed,
};
const result = document.querySelector<HTMLElement>('#result');
if (result !== null) result.textContent = JSON.stringify(evidence, null, 2);
document.body.dataset['status'] = passed ? 'pass' : 'fail';
if (!passed) throw new Error('browser_registry_budget_exceeded');
