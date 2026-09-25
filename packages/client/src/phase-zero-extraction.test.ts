import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Captured from the X3/X4 pre-move snapshots. Module specifiers are normalized
 * because package extraction changes their spelling without changing runtime
 * logic. Keep this list scoped to the sources which existed in those snapshots;
 * later feature files are intentionally outside the Phase 0 equivalence proof.
 */
const PHASE_ZERO_SOURCES = `
engine/animated-terrain.ts
engine/camera.ts
engine/collision.ts
engine/cute-fantasy-actor-catalog.generated.ts
engine/cute-fantasy-actor-library.ts
engine/display.ts
engine/editor-terrain.ts
engine/farmland.ts
engine/fishing-line.ts
engine/ground-cache.ts
engine/light-flood.ts
engine/light-occlusion.ts
engine/light-sources.ts
engine/lighting.ts
engine/live-map-runtime.ts
engine/loading-screen.ts
engine/metrics.ts
engine/overworld-art.ts
engine/particles.ts
engine/player-rig-assets.ts
engine/raised-terrain-depth.ts
engine/render-benchmark-scenarios.ts
engine/render-benchmark.ts
engine/renderer.ts
engine/stone-palette.ts
engine/terrain-cutaway.ts
engine/terrain-inspector.ts
engine/terrain.ts
engine/tilemap.ts
engine/weather-effects.ts
ui/assets.ts
ui/bounded-stepper.ts
ui/button.ts
ui/canvas-text-input.ts
ui/character-name-prompt.ts
ui/character-screen.ts
ui/chat-command.ts
ui/chat-overlay.ts
ui/compositions.ts
ui/container-binding.ts
ui/currency-display.ts
ui/design-system/book.ts
ui/design-system/fantasy-controls.ts
ui/design-system/frame.ts
ui/design-system/game-markdown.ts
ui/design-system/index.ts
ui/design-system/inventory.ts
ui/design-system/layout.ts
ui/design-system/rich-text.ts
ui/dom-panel-skin.ts
ui/drag-context.ts
ui/gateway-frame.ts
ui/geometry.ts
ui/help-book.ts
ui/homestead-build-palette.ts
ui/index.ts
ui/input-router.ts
ui/item-slot.ts
ui/layout.ts
ui/nine-slice.ts
ui/npc-interaction-ui.ts
ui/orchard-backdrop.ts
ui/overworld-ui.ts
ui/pixel-ui.ts
ui/player-resource-frame.ts
ui/progress-bar.ts
ui/progression-tabs.ts
ui/quest-log.ts
ui/quest-tracker.ts
ui/recipe-book.ts
ui/ribbon.ts
ui/roguelike-ui.ts
ui/scrollbar.ts
ui/selector.ts
ui/skill-point-notice.ts
ui/skill-tree-ui.ts
ui/skin.ts
ui/slider.ts
ui/speech-bubble.ts
ui/sprite.ts
ui/statistics-screen.ts
ui/storage-frame.ts
ui/toggle.ts
ui/touch-controls.ts
ui/trade-ui.ts
ui/ui-lab-catalog.ts
ui/widget.ts
`.trim().split('\n');

const STRUCTURAL_SEAMS = new Set([
  'engine/collision.ts',
  'engine/live-map-runtime.ts',
  'ui/index.ts',
  'ui/overworld-ui.ts',
  'ui/trade-ui.ts',
]);

const PRE_EXTRACTION_STRUCTURAL_SEAM_DIGEST = '78799177788c0b958e490dddfaaaa2fcc2ed5cdae125305de0f86cd1d95a1c05';
// Re-reviewed after the authoring-suite runtime registry, shared Studio UI,
// generic portable-light lit-state rendering, authored frame-action dispatch,
// registry-fed farming/recipe skill availability, private process-job frame projection,
// crafting composition slot/hit-bound alignment, fixed game window sizing,
// blocking-update native cursor/input ownership, and immediate service-worker
// modal readiness and viewport synchronization independent of world readiness
// explicitly prepared terrain collision reused by the game instance,
// and retained mobile-control placement settings
// landed across these package seams. This remains a source-shape tripwire: any later change must be
// reviewed and deliberately re-captured here.
// Render-recovery (plan 59) preflight pins the supplied 0.5.7 baseline, including seasonal lighting's
// shared frame-source export and complete Basic/Classic/Dynamic Video selector.
// All five seams are unchanged from the preserved pre-implementation snapshot;
// import-direction and ownership assertions below remain independent gates.
// Plan 59 P0 adds the required touch-accessible Render-panel capture action.
// Plan 59 P1 adds the persisted World scale control in the same Video panel.
// Plan 59 P3 deletes the filtered-frame export and keeps only shared frame metadata.
// Plan 59 P6 shares the outer painter state pair with authored-map sprites.
// Plan 59 P7 adds the presentation cap and ordered HUD caches.
// Plan 59 P8 adds the experimental backend control and fallback footer.
// Hearth Harbour and Embers adds reviewed equipment/reward/ferry UI and explicit private stash
// slot bindings. Native fixtures and interaction tests accompany this re-capture.
// Includes the subsequent reviewed residence architecture/seating controls and
// protected-boundary ribbon. Source/art review: wiki History/Hearth Harbour and Embers.
// Phase 6 resolves visible authored effects from the subscribed registry and
// gives unknown effect slugs a neutral HUD icon rather than another effect's art.
// Live inventory slots also reject retained artwork for missing or retired
// definitions before selecting an authored animation frame.
// Chest controls restore sort/search within shared authored frames, retaining
// physical slot custody. Review: wiki Content/Objects & Machines (chests); interaction
// and browser-canvas checks accompany this re-capture.
// Gameplay 0.8.1 keeps tool labels to one line and delays bounded equipment
// details above the hotbar. Review: wiki History/Releases 0.7-0.8; tooltip layout,
// dwell, and real item-label regressions accompany this re-capture.
// Mobile build access adds the reviewed hammer HUD callback and overlay hit priority.
// Review and controls: wiki Systems/Cellar & Processing; touch routing tests accompany this update.
// Kenmi icon refresh shares Build/Crafting button chrome and preserves purse inventory.
// Review: wiki Art/Icons; HUD interaction tests cover the change.
// Studio integration shares the player-rig asset contract through the game-safe
// UI barrel; the workbench stays behind @orchard/ui/studio and the client build guard.
// Delve keepsake review: wiki Decisions/ADR-003 Delve Completion Keepsake. Against main 2aee1799 / Orchard b8870362,
// all five seams differ only in the admission label announcing the first-win
// home recipe; package ownership and acyclic-import gates remain unchanged.
// Willowharbour binds native streetlamps to the authored lighting definition.
// Review: wiki History/Willowharbour Town Passes; fixture-light tests cover this seam.

// Combined review: wiki History/Gameplay Loop Stack (branch integration); retain all three approved seam edits.
// Live editor review: shared authored-object adjacency retains original-art fallback
// and complete-document topology. See wiki World/Tiles & Rules.
// Connected town lamps resolve one authoritative state and skip static duplicates.
// Review: wiki History/Willowharbour Town Passes.
// Empty hotbar sentinels no longer render missing-art icons; collision now uses
// shared authored footprint cells. Review: wiki Systems/Crafting (workbench, world interactions).
// Smart object state resolves growth/appearance through the shared renderer.
// Review: wiki Studio/Map Editor (Smart and Exact modes); parser, delta and visual regressions.
// Retain the separately reviewed Update Ready button inset of 21px.
// D6 review: wiki World/Traversal; additive shared media channels,
// actor-specific prediction/projectiles and independent solid geometry. Shadow preserves legacy.
// Object runtime review: wiki Content/Objects & Machines; map appearance bindings
// replace asset light lists and prefix shadows; canvas transform/depth tests pass.
// Combined runtime review: wiki History/Release 2026-09-23; retain both D6 channels and object appearance.
// Docs retirement (2026-09-24) re-captures one comment in ui/overworld-ui.ts that now cites the wiki
// page Systems/Lighting & Seasons instead of retired doc 27; no code changed.
// BUG-017 (PR104): reviewed OverworldUi touch arbitration resolves vertical
// scrolling before pickup and locks horizontal drag ownership. Actual-host
// regressions pass; the other four seams and all import-direction gates are unchanged.
// September24 inventory/storage adoption extracts the existing gesture authority
// into shared helpers and binds four retained compositions. Actual-host regressions
// cover cursor custody, restrictions, touch/focus and reconnect; other seams remain unchanged.
// Trade adoption retires the old drawing/native input paths; two-identity reducer,
// revision, money and reconnect tests cover the replacement wrapper.
// Processor adoption extends only reviewed frame routes and forwards authoritative
// process progress; actual frame/slot/timing/command regressions cover the seam.
// Reviewed quest/help host integration removes both legacy draw/input paths; actual host tests
// cover deep links, parent shortcuts, focus/resize, one command and cancelled touch custody.
// Reviewed system-menu command adapter and retirement of its production legacy dispatch.
// Reviewed shared character/statistics adapters, appearance rejection and legacy path retirement.
// Reviewed skills host: shared navigation, actual parent deep links and captured reconnect tails.
// Reviewed shared overlay lifecycle: synchronous PWA readiness, input priority and confirmation scope.
// Reviewed shared HUD projections, legacy hit-path retirement and foreground tracker ordering.
// Reviewed roster replacement removes legacy rendering, scroll/role hit paths together.
// Actual inventory coexistence, scoped management and touch-release regressions cover this seam.
// Reviewed feedback projection preserves dwell/notification authority and retires
// legacy production drawing and notice hits together; real-parent geometry and
// actual-source privacy/timing/scope regressions pass independently.
// BUG029 forwards actual touch placement and explicit compact-page keyboard ownership.
// Actual-parent runtime tests cover layout, one target command and Escape focus return.
// Game UI redesign: the retained inventory snapshot passes the paper-doll portrait painter (drawPlayerDoll);
// inventory-menus host and container-binding tests cover fitted windows and bindings.
// Recipe-book rows carry output, status and per-ingredient need/have; crafting-frame and host tests cover the book.
// Player book: character, skills and records navigate across all four chapters (UiGameBookChapter, now including quests)
// and the quest log's chapter tabs open them; character, skill, records, quest and reading host tests cover the tabs.
// Dialogue, merchant, merchant panels and trade render approved uiWindow compositions; the trade host no longer
// sizes its window (it centres and the window caps itself). NPC, merchant, seal-panel and trade host tests cover the seam.
// Review fixes: crafting recipes carry a visible reason (skill rank or station), the game menu opens the character
// book, and the client's dodge key reads the shared TOUCH_ACTION_KEY_CODES; crafting, menu and touch tests cover them.
// Static world S4e moves map-object drawing, lights and occluders out of engine/live-map-runtime.ts into
// engine/map-object-presentation.ts (plain object records, injected terrain sampler); live-map-runtime keeps
// document-based adapters with unchanged names. Parity and import-boundary tests cover the move; no behaviour change.
// BUG-037: ghostFillCraftingRecipe may return the authority's promise so a refused recipe placement
// rolls the selection back; crafting-frame and overworld-ui tests cover it.
// Static world S6a (PR #169) rewrites only the @orchard/sim value imports in ui/overworld-ui.ts: the same
// bindings now come from generator-free @orchard/sim/<module> subpaths (types stay on the barrel), which
// splits two import statements into several. No code changed; the other four seams are unchanged.
// Subpath identity (=== barrel exports) and generator-free boundary tests cover the rewrite.
// Static world S4d (PR #184) makes engine/collision.ts origin-aware for chunk windows and adds the chunk
// collision builder path; whole maps (no origin) behave as before. Chunk-collision parity and pinned
// whole-map collision digests cover it; the other four seams are unchanged.
// Uint8Array flag planes (S4f follow-up) store engine/collision.ts's blocked planes as 0/1 bytes instead
// of boolean[] (cellar boundary, water, dock correction; built with cellFlagsWhere). The pinned whole-map collision digests cover
// it (the same bytes); the other four seams are unchanged.
const STRUCTURAL_SEAM_DIGEST = 'ebbe3b6e3288e781bc3bf0e33e60aefda4b80f14ab474312709e561773b100e3';
// Shared authored timing pane: optional projection model and game-safe kit bridge exports.
// Review: wiki Systems/Weather & Time (timing clock domains); frame, settlement and bundle tests cover the seam.

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizedSource(source: string): string {
  return source
    .replaceAll('\r\n', '\n')
    .replace(/(from\s+|import\s*\()(['"])[^'"]+\2/g, '$1"<module>"');
}

function currentDigest(paths: readonly string[]): string {
  const rows = paths.map((sourcePath) => {
    const [workspace, ...relativeParts] = sourcePath.split('/');
    const sourceUrl = new URL(`../../${workspace}/src/${relativeParts.join('/')}`, import.meta.url);
    return `${sourcePath}:${sha256(normalizedSource(readFileSync(sourceUrl, 'utf8')))}`;
  });
  return sha256(rows.join('\n'));
}

function typescriptSources(root: URL): readonly { readonly path: string; readonly source: string }[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryUrl = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, root);
    if (entry.isDirectory()) return typescriptSources(entryUrl);
    return entry.name.endsWith('.ts')
      ? [{ path: entryUrl.pathname, source: readFileSync(entryUrl, 'utf8') }]
      : [];
  });
}

function importsMatching(root: URL, forbidden: RegExp): readonly string[] {
  return typescriptSources(root).flatMap(({ path, source }) => {
    const moduleSpecifiers = [...source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)]
      .map((match) => match[2]!);
    return moduleSpecifiers.filter((specifier) => forbidden.test(specifier))
      .map((specifier) => `${path}: ${specifier}`);
  });
}

describe('Phase 0 extraction equivalence', () => {
  it('keeps every extracted non-seam source under shared package ownership', () => {
    const unchanged = PHASE_ZERO_SOURCES.filter((source) => !STRUCTURAL_SEAMS.has(source));
    expect(unchanged).toHaveLength(82);
    for (const sourcePath of unchanged) {
      const [workspace, ...relativeParts] = sourcePath.split('/');
      const sourceUrl = new URL(`../../${workspace}/src/${relativeParts.join('/')}`, import.meta.url);
      expect(existsSync(sourceUrl), sourcePath).toBe(true);
    }
  });

  it('locks the five reviewed structural package-boundary seams', () => {
    const seams = PHASE_ZERO_SOURCES.filter((source) => STRUCTURAL_SEAMS.has(source));
    expect(seams).toHaveLength(5);
    expect(currentDigest(seams)).toBe(STRUCTURAL_SEAM_DIGEST);
    expect(STRUCTURAL_SEAM_DIGEST).not.toBe(PRE_EXTRACTION_STRUCTURAL_SEAM_DIGEST);
  });

  it('leaves no extracted implementation tree in the game client', () => {
    for (const path of ['./render/', './ui/', './auth/', './net/generated/', './editor/']) {
      expect(existsSync(new URL(path, import.meta.url)), path).toBe(false);
    }
    for (const path of [
      '../editor.html', '../audio-preview.html', './editor-main.ts', './audio-preview.ts',
      './character-studio.ts', './ui-lab.ts',
    ]) expect(existsSync(new URL(path, import.meta.url)), path).toBe(false);
  });

  it('keeps the game entry free of Studio routes and compatibility branches', () => {
    const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
    expect(main).not.toMatch(/\/editor(?:\/|['"])/u);
    expect(main).not.toMatch(/(?:ui[_-]lab|character[_-]studio|item[_-]studio|offline[_-]editor)/iu);
  });

  it('uses the shared owner-or-admin rule at every game administration gate', () => {
    const overworld = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');
    expect(overworld.match(/\bcanAdministerWorld\(/g)).toHaveLength(4);
    expect(overworld).not.toMatch(/membership\?\.role\s*[!=]==?\s*['"]owner['"]/);
  });

  it('keeps client, Studio, renderer, UI, bindings, and auth boundaries acyclic', () => {
    const client = new URL('./', import.meta.url);
    const studio = new URL('../../studio/src/', import.meta.url);
    const engine = new URL('../../engine/src/', import.meta.url);
    const ui = new URL('../../ui/src/', import.meta.url);
    expect(importsMatching(client, /^@orchard\/studio(?:\/|$)/)).toEqual([]);
    expect(importsMatching(client, /^@orchard\/ui\/studio(?:\/|$)/)).toEqual([]);
    expect(importsMatching(studio, /^@orchard\/client(?:\/|$)/)).toEqual([]);
    expect(importsMatching(engine, /^@orchard\/(?:auth|world-bindings)(?:\/|$)/)).toEqual([]);
    expect(importsMatching(ui, /^@orchard\/(?:auth|world-bindings)(?:\/|$)/)).toEqual([]);
  });
});
