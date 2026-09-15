import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { drawInitialWorldLoading } from './initial-world-loading.js';
import { drawGatewayLoading, drawOrchardBackdrop, type LoadedAsset, type PixelUi, type UiSkin } from '@orchard/ui';

vi.mock('@orchard/ui', () => ({ drawGatewayLoading: vi.fn(), drawOrchardBackdrop: vi.fn() }));
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
    loadingStage: { title: 'GROWING YOUR ISLAND', progress: 78, ready: false },
    latestSnapshot: { error: null as string | null },
    network: { gameplayReady: false, recoveryState: 'connecting' },
    hasRenderedWorldFrame: false,
    hudViewportCss: () => ({ width: 800, height: 600 }), fittedUiScale: () => 2, desiredUiScale: 2,
    overworldUi: { setPwaUpdateStatus: vi.fn(), blockingUpdatePromptVisible: false }, pwaClient: { status: {} },
    canvas: { classList: { add: vi.fn() } }, dismissLoadingScreen: vi.fn(),
    safeAreaInsets: { left: 0, top: 0 }, renderer: {},
    worldUpdateOverlay: { draw: vi.fn(), reset: vi.fn() },
    connectionRecoveryOverlay: { composite: vi.fn() }, drawInitialWorldLoading: vi.fn(),
    art: { ui: {}, uiSkin: {}, fruitItems: { apple: {} }, missingItem: {} },
    renderStarted: performance.now(), renderMetrics: { record: vi.fn(), recordRenderSubmit: vi.fn() },
  };
  return { deps, render: () => new Function(...Object.keys(deps), code)(...Object.values(deps)) };
}

describe('initial world loading versus reconnection', () => {
  it.each(['connecting', 'ready', 'reconnecting'])('keeps initial %s/hydration in the normal gateway, including handshake retries', state => {
    const f = fixture(); f.deps.network.recoveryState = state;
    f.render();
    expect(f.deps.drawInitialWorldLoading).toHaveBeenCalledWith(f.deps.renderer, expect.any(Object), f.deps.loadingStage, 'test');
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
  it('does not call connected world-data hydration a reconnection', () => {
    const f = fixture(); f.deps.hasRenderedWorldFrame = true; f.deps.network.recoveryState = 'ready';
    f.render();
    expect(f.deps.drawInitialWorldLoading).toHaveBeenCalledOnce();
    expect(f.deps.connectionRecoveryOverlay.composite).not.toHaveBeenCalled();
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
    const assets = { ui: {} as PixelUi, skin: {} as UiSkin, apple: {} as LoadedAsset };
    const stage = { title: 'UNPACKING YOUR THINGS', detail: '', progress: 95 };
    drawInitialWorldLoading(renderer, assets, stage, '0.8.2');
    expect(drawOrchardBackdrop).toHaveBeenCalledWith(context, 800, 600);
    expect(drawGatewayLoading).toHaveBeenCalledWith(context, assets, stage.title, 95, false, '0.8.2');
    expect(renderer.endUi).toHaveBeenCalledOnce();
    expect(context.restore).toHaveBeenCalledOnce();
  });
});
