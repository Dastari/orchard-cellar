import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

function filesBelow(path: string): readonly string[] {
  return readdirSync(path).flatMap((name) => {
    const child = join(path, name);
    return statSync(child).isDirectory() ? filesBelow(child) : [child];
  });
}

describe('canvas-native Studio source policy', () => {
  it('ships one root canvas and no HTML UI or hidden semantic controls', () => {
    const html = source('../../index.html');
    expect(html.match(/<canvas\b/gu)).toHaveLength(1);
    expect(html).toContain('<canvas id="studio"');
    expect(html).not.toMatch(/<(?:main|div|button|input|select|textarea|table)\b/iu);
    expect(source('../main.ts')).toContain("querySelector<HTMLCanvasElement>('#studio')");
  });

  it('renders and operates the retained shell only through shared @orchard/ui canvas primitives', () => {
    const app = source('./app.ts');
    expect(app).toContain("from '@orchard/ui'");
    expect(app).toContain('loadStudioCanvasShellArt');
    expect(app).toContain('drawStudioCanvasShell(context, this.#art');
    expect(app).toContain("this.canvas.setAttribute('role', 'application')");
    expect(app).toContain('new UiInputRouter(this.#scene.widgets)');
    expect(app).toContain('new ResizeObserver(this.onResize)');
    expect(app).toContain('this.#resizeObserver?.disconnect()');
    expect(app).toContain('cancelAnimationFrame(this.#drawFrame)');
    expect(app).toContain("this.canvas.removeEventListener('pointerdown', this.onPointerDown)");
    expect(app).toContain("this.canvas.removeEventListener('keyup', this.onKeyUp)");
    expect(app).toContain('reconcileStudioToolLifecycles(this.#mountedToolLifecycles, [])');
    expect(app).toContain('layoutUiFrameSlots(');
    expect(app).toContain('studioToolIcon(candidate.tool.id)');
    expect(app).toContain("kind: 'tooltip'");
    expect(app).toContain("? 'thin_panel' : node.kind");
    expect(app).not.toContain("panel('tool-surface'");
    expect(app).toContain("kind: 'alpha_grid'");
    expect(app).toContain("resizeEdge('drawer-edge-left'");
    expect(app).toContain("resizeEdge('drawer-edge-right'");
    expect(app).toContain("kind: 'ribbon'");
    expect(app).not.toContain("panel('header'");
    expect(app).not.toContain("panel('output'");
    expect(app).not.toContain("'ORCHARD STUDIO'");
    expect(app).not.toContain('PRODUCTION — AUDITED LIVE AUTHORITY');
    expect(app).toContain("route.tool.id !== 'map'");
    expect(app).toContain('inspectorBounds');
    expect(app).toContain('sessionStorage.setItem(`${DRAWER_WIDTHS_KEY}:${this.#layoutRoute}`');
    expect(app).toContain('layoutStudioCanvasSplit(toolBounds, this.#layoutState.direction, this.#layoutState.ratio)');
    expect(app).not.toContain("action('layout-save'");
    expect(app).not.toContain("action('layout-restore'");
    expect(app).not.toContain("action('layout-split-toggle'");
    expect(app).toContain("resizeEdge('workspace-split-edge'");
    expect(app).toContain('studioCanvasSplitRatioAtPoint(');
    expect(app).not.toContain("id: 'workspace-split-handle', kind: 'thin_panel'");
    expect(app).toContain('tool.id !== primaryToolId');
    expect(app).toContain("label('tool-surface-label', 'LOADING WORKSPACE'");
    expect(app).not.toContain('route.tool.label.toUpperCase()} WORKING CANVAS');
    expect(app).toContain('workspaceOnly && (inside(nodeCenter, controlsBounds) || inside(nodeCenter, inspectorBounds))');
    expect(app).toContain('workspaceOnly && (inside(actionCenter, controlsBounds) || inside(actionCenter, inspectorBounds))');
    expect(app).not.toContain('function inset(');
    expect(app).not.toMatch(/document\.createElement|innerHTML|HTMLInputElement|HTMLElement/u);
    expect(app).not.toMatch(/import\(['"]\.\.\/tools\/.*\/view/u);
    expect(existsSync(new URL('./canvas-shell-layer.ts', import.meta.url))).toBe(false);
    expect(source('./builtin-canvas-tools.ts')).not.toContain('/view.js');
  });

  it('routes unmodified G through one shell-level grid preference without stealing text input', () => {
    const app = source('./app.ts');
    const controller = source('./controller.ts');
    expect(controller).toContain('gridVisible(): boolean');
    expect(controller).toContain('toggleGrid(): boolean');
    expect(app).toContain("event.key.toLowerCase() === 'g'");
    expect(app).toContain('!textEditorFocused');
    expect(app).toContain('!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey');
    expect(app).toContain('shouldToggleStudioGrid(event, editor !== null)');
    expect(app).toContain('this.controller.toggleGrid()');
    expect(app).toContain('if (this.controller.gridVisible())');
  });

  it('keeps full-canvas tool paint behind floating chrome and routes input after shell precedence', () => {
    const app = source('./app.ts');
    const base = app.indexOf('drawStudioCanvasShell(context, this.#art');
    const toolDraw = app.indexOf('layer.draw(context, this.#art)');
    const chrome = app.indexOf('drawStudioCanvasShellNodes(context, this.#art, foregroundNodes)');
    const overlays = app.indexOf('drawStudioCanvasShellNodes(context, this.#art, overlayNodes)');
    expect(base).toBeGreaterThan(-1);
    expect(base).toBeLessThan(toolDraw);
    expect(toolDraw).toBeLessThan(chrome);
    expect(chrome).toBeLessThan(overlays);
    expect(app).toContain('captureInput?.(surface.input)');
    expect(app).toContain('this.#scene.input?.pointerDown?');
    expect(app).toContain('this.#scene.input?.pointerMove?');
    expect(app).toContain('this.#scene.input?.pointerUp?');
    expect(app).toContain('this.#scene?.input?.pointerCancel?');
    expect(app).toContain('this.#scene.input?.wheel?');
    expect(app).toContain('this.#scene?.input?.keyDown?');
    expect(app).toContain('spaceHeld: this.#spaceHeld');
    expect(app).toContain('this.#toolPointerOwner = event.pointerId');
    expect(app).toContain('this.#toolPointerOwner === event.pointerId');
  });

  it('limits CSS to the sole canvas surface rather than a second component system', () => {
    const css = source('./shell.css');
    expect(css).toContain('#studio');
    expect(css).not.toMatch(/\.orchard-studio|\.studio-(?:header|shell|rail|workspace|palette)|\[data-/u);
    expect(css).not.toMatch(/\b(?:button|input|select|textarea|table)\b/u);
  });

  it('forbids copied editor primitives and per-tool database connections', () => {
    const toolsRoot = new URL('../tools', import.meta.url).pathname;
    const files = filesBelow(toolsRoot).filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts'));
    expect(files.filter((path) => basename(path).startsWith('legacy-'))).toEqual([]);
    for (const path of files) {
      const contents = readFileSync(path, 'utf8');
      const withoutOffscreenCanvas = contents.replaceAll("document.createElement('canvas')", 'offscreenCanvas()');
      expect(contents, path).not.toMatch(/from ['"].*(?:client\/src\/editor|editor\/editor-ui)/u);
      expect(contents, path).not.toContain('DbConnection.builder()');
      expect(contents, path).not.toMatch(/function\s+(?:drawNineSlice|drawUiSkinAsset|drawPixelText|drawItemSlot)\b/u);
      expect(withoutOffscreenCanvas, path).not.toMatch(/document\.createElement|createElementNS|innerHTML|HTMLElement|HTMLInputElement|HTMLTableElement|SVGElement/u);
    }
  });

  it('routes retained canvas-table pointer, wheel and keyboard input', () => {
    const app = source('./app.ts');
    expect(app).toContain('hitStudioCanvasTable(table.layout, point)');
    expect(app).toContain("event.key === 'PageUp' ? 'page_up'");
    expect(app).toContain('scrollStudioCanvasTable(table.layout, command)');
    expect(app).toContain("event.deltaY < 0 ? 'line_up' : 'line_down'");
  });
});
