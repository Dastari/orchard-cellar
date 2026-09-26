import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { drawInitialWorldLoading } from './initial-world-loading.js';
import { WORLD_GAP_GRACE_MS, worldGapPresentation } from './connection-recovery-overlay.js';
import { drawOrchardBackdrop, type LoadedAsset } from '@orchard/ui';
import type { UiKitArt } from '@orchard/ui/game';

vi.mock('@orchard/ui', () => ({ drawOrchardBackdrop: vi.fn() }));
vi.mock('@orchard/ui/game', async importOriginal => { const real = await importOriginal<typeof import('@orchard/ui/game')>(); return {...real, GameGatewayLoading: class {setBounds=vi.fn();update=vi.fn();draw=vi.fn();dispose=vi.fn();constructor(){ loadingViews.push(this); }}}; });
const loadingViews = vi.hoisted(() => [] as {setBounds:ReturnType<typeof vi.fn>;update:ReturnType<typeof vi.fn>;draw:ReturnType<typeof vi.fn>;dispose:ReturnType<typeof vi.fn>}[]);
const source = ts.createSourceFile('overworld-main.ts', readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function declaration(name: string) {
  const node = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!node || !ts.isFunctionDeclaration(node)) throw new Error(`missing ${name}`);
  return node;
}
const branch = declaration('renderFrame').body!.statements.find(node => ts.isIfStatement(node) && node.expression.getText(source).includes('loadingStage.ready'))!;
const code = ts.transpileModule(`${declaration('connectionRecoveryState').getText(source)}\n${branch.getText(source)}`
  .replaceAll('import.meta.env.VITE_CLIENT_VERSION', "'test'"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture() {
  const deps = {
    loadingStage: { title: 'GROWING YOUR ISLAND', progress: 78, ready: false, error: false },
    latestSnapshot: { error: null as string | null },
    network: { gameplayReady: false, recoveryState: 'connecting' },
    hasRenderedWorldFrame: false,
    hudViewportCss: () => ({ width: 800, height: 600 }), fittedUiScale: () => 2, desiredUiScale: 2,
    overworldUi: { setPwaUpdateStatus: vi.fn(), blockingUpdatePromptVisible: false }, pwaClient: { status: {} },
    canvas: { classList: { add: vi.fn() } }, dismissLoadingScreen: vi.fn(),
    safeAreaInsets: { left: 0, top: 0, right:0, bottom:0 }, renderer: { compositeWorld: vi.fn() }, kitArt:{},
    worldGapPresentation, worldGapStartedAt: null as number | null, presentedRecoveryState: null,
    worldUpdateOverlay: { draw: vi.fn(), reset: vi.fn() },
    connectionRecoveryOverlay: { composite: vi.fn(), compositeResync: vi.fn() }, drawInitialWorldLoading: vi.fn(),
    art: { ui: {}, uiSkin: {}, groundItems: { apple: {} }, itemIcons: {}, missingItem: {} },
    renderStarted: performance.now(), renderMetrics: { record: vi.fn(), recordRenderSubmit: vi.fn() },
    // Static world S4f: terrain readiness (always ready outside chunk mode `on`).
    spawnReadiness: { status: () => ({ ready: true }) as { ready: boolean } }, WORLD_GAP_GRACE_MS, TOPSIDE_SPACE_ID: 0, TILE_SIZE_FIXED: 256,
    localAuthority: undefined as { spaceId: number; x: number; y: number } | undefined, worldSource: { setView: vi.fn(), advance: vi.fn(), window: vi.fn() },
    snapshot: { content: { registry: {} } },
  };
  return { deps, render: () => new Function(...Object.keys(deps), code)(...Object.values(deps)) };
}

describe('initial world loading versus reconnection', () => {
  it.each(['connecting', 'ready', 'reconnecting'])('keeps initial %s/hydration in the normal gateway, including handshake retries', state => {
    const f = fixture(); f.deps.network.recoveryState = state;
    f.render();
    expect(f.deps.drawInitialWorldLoading).toHaveBeenCalledWith(f.deps.renderer, expect.any(Object), f.deps.loadingStage, 'test', f.deps.safeAreaInsets);
    expect(f.deps.connectionRecoveryOverlay.composite).not.toHaveBeenCalled();
  });
  it('shows recovery after the player has entered the world', () => {
    const f = fixture(); f.deps.hasRenderedWorldFrame = true; f.deps.network.recoveryState = 'reconnecting';
    f.render();
    expect(f.deps.connectionRecoveryOverlay.composite).toHaveBeenCalledWith(f.deps.renderer, expect.any(Object), 'reconnecting', true);
    expect(f.deps.drawInitialWorldLoading).not.toHaveBeenCalled();
  });
  it.each(['offline', 'sign-in-required', 'content-incompatible'])('preserves initial %s actions and returns to normal loading when resolved', state => {
    const f = fixture();
    if (state === 'content-incompatible') f.deps.latestSnapshot.error = 'content_registry_invalid';
    else f.deps.network.recoveryState = state;
    f.render();
    expect(f.deps.connectionRecoveryOverlay.composite).toHaveBeenCalledWith(f.deps.renderer, expect.any(Object), state, false);
    f.deps.network.recoveryState = 'connecting'; f.deps.latestSnapshot.error = null;
    f.render();
    expect(f.deps.drawInitialWorldLoading).toHaveBeenCalledTimes(1);
  });
  it('keeps the last world frame while a returning tab re-syncs, then a neutral note without RETRY (BUG-040)', () => {
    const f = fixture(); f.deps.hasRenderedWorldFrame = true; f.deps.network.recoveryState = 'ready';
    f.render();
    expect(f.deps.renderer.compositeWorld).toHaveBeenCalledOnce();
    expect(f.deps.drawInitialWorldLoading).not.toHaveBeenCalled();
    expect(f.deps.connectionRecoveryOverlay.composite).not.toHaveBeenCalled();
    f.deps.worldGapStartedAt = performance.now() - WORLD_GAP_GRACE_MS - 1;
    f.render();
    expect(f.deps.connectionRecoveryOverlay.compositeResync).toHaveBeenCalledWith(f.deps.renderer, expect.any(Object));
    expect(f.deps.connectionRecoveryOverlay.composite).not.toHaveBeenCalled();
    expect(f.deps.drawInitialWorldLoading).not.toHaveBeenCalled();
  });
  it('shows a mid-session error stage on the gateway screen, not as reconnecting (BUG-040 review)', () => {
    const f = fixture(); f.deps.hasRenderedWorldFrame = true; f.deps.network.recoveryState = 'ready';
    f.deps.loadingStage = { ...f.deps.loadingStage, error: true };
    f.deps.worldGapStartedAt = performance.now() - WORLD_GAP_GRACE_MS - 1;
    f.render();
    expect(f.deps.drawInitialWorldLoading).toHaveBeenCalledWith(f.deps.renderer, expect.any(Object), f.deps.loadingStage, 'test', f.deps.safeAreaInsets);
    expect(f.deps.connectionRecoveryOverlay.composite).not.toHaveBeenCalled();
    expect(f.deps.connectionRecoveryOverlay.compositeResync).not.toHaveBeenCalled();
  });
  it('keeps update decisions ahead of both initial loading and recovery', () => {
    const f = fixture(); f.deps.overworldUi.blockingUpdatePromptVisible = true;
    f.render();
    expect(f.deps.worldUpdateOverlay.draw).toHaveBeenCalledOnce();
    expect(f.deps.connectionRecoveryOverlay.composite).not.toHaveBeenCalled();
    expect(f.deps.drawInitialWorldLoading).not.toHaveBeenCalled();
    f.deps.overworldUi.blockingUpdatePromptVisible = false; f.render();
    expect(f.deps.drawInitialWorldLoading).toHaveBeenCalledOnce();
  });
  it('uses the same gateway window and live progress as startup, closing the UI render pass', () => {
    const context = { save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn() };
    const renderer = { beginUi: vi.fn(() => context as unknown as CanvasRenderingContext2D), endUi: vi.fn(), cssWidth: 800, cssHeight: 600 };
    const assets = { kitArt: {} as UiKitArt, apple: {} as LoadedAsset };
    const stage = { title: 'UNPACKING YOUR THINGS', detail: '', progress: 95 };
    drawInitialWorldLoading(renderer, assets, stage, '0.8.2');
    expect(drawOrchardBackdrop).toHaveBeenCalledWith(context, 800, 600);
    expect(loadingViews.at(-1)!.update).toHaveBeenCalledWith(stage);
    expect(loadingViews.at(-1)!.draw).toHaveBeenCalledWith(context);
    const count = loadingViews.length; drawInitialWorldLoading(renderer,assets,{...stage,progress:99},'0.8.2');
    expect(loadingViews).toHaveLength(count);
    expect(loadingViews.at(-1)!.update).toHaveBeenLastCalledWith({...stage,progress:99});
    expect(renderer.endUi).toHaveBeenCalledTimes(2);
    expect(context.restore).toHaveBeenCalledTimes(2);
  });

  it('keeps a topside arrival waiting for terrain behind a light note and pins the chunks around the player (static world S4f)', () => {
    const f = fixture(); f.deps.hasRenderedWorldFrame = true; f.deps.network.recoveryState = 'ready';
    f.deps.loadingStage = { title: 'MAPPING THE SHORE', progress: 92, ready: false, error: false };
    f.deps.spawnReadiness = { status: () => ({ ready: false }) };
    f.deps.localAuthority = { spaceId: 0, x: 300 * 256 + 5, y: 410 * 256 };
    f.render();
    expect(f.deps.worldSource.setView).toHaveBeenCalledWith({ minX: 300, minY: 410, maxX: 300, maxY: 410 });
    // The served window keeps catching up with arrived chunks while nothing is drawn.
    expect(f.deps.worldSource.advance).toHaveBeenCalledWith(f.deps.snapshot.content.registry);
    expect(f.deps.worldSource.window).toHaveBeenCalledWith(f.deps.snapshot.content.registry);
    expect(f.deps.renderer.compositeWorld).toHaveBeenCalledOnce();
    expect(f.deps.drawInitialWorldLoading).not.toHaveBeenCalled();
    f.deps.worldGapStartedAt = f.deps.renderStarted - 300; f.render();
    expect(f.deps.connectionRecoveryOverlay.compositeResync).toHaveBeenCalledWith(f.deps.renderer, expect.any(Object), 'terrain');
    // Ready terrain (modes off and shadow): the pin is left to the camera as before.
    const off = fixture(); off.deps.hasRenderedWorldFrame = true; off.deps.localAuthority = { spaceId: 0, x: 0, y: 0 };
    off.render();
    expect(off.deps.worldSource.setView).not.toHaveBeenCalled();
  });
});
