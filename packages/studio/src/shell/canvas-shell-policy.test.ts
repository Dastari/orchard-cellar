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

  it('owns shell chrome and input through the kit root, with explicit lifecycle teardown', () => {
    const app = source('./app.ts');
    expect(app).toContain('new UiRoot('); expect(app).toContain('ui.workbench('); expect(app).toContain('ui.splitPane(');
    expect(app).toContain('new UiTextBridge('); expect(app).toContain('this.#root.pointer('); expect(app).toContain('this.#root.key(');
    expect(app).toContain('this.#root.draw('); expect(app).toContain('this.#abort.abort()'); expect(app).toContain('this.#root.dispose()');
    expect(app).toContain('this.#observer?.disconnect()'); expect(app).toContain('reconcileStudioToolLifecycles(');
    expect(app).not.toMatch(/drawStudioCanvasShell|drawStudioCanvasTable|new UiInputRouter|new CanvasFocusManager|document\.createElement|innerHTML/u);
    expect(app).toContain('saveNamedLayout('); expect(app).toContain('restoreNamedLayout('); expect(app).toContain('persistLayoutSession(');
    expect(app).toContain('studioToolIcon(candidate.tool.id)');
    expect(source('./builtin-canvas-tools.ts')).not.toContain('/view.js');
    expect(existsSync(new URL('./canvas-shell-layer.ts', import.meta.url))).toBe(false);
  });

  it('routes unmodified G through one shell-level grid preference without stealing text input', () => {
    const app = source('./app.ts');
    const controller = source('./controller.ts');
    expect(controller).toContain('gridVisible(): boolean');
    expect(controller).toContain('toggleGrid(): boolean');
    expect(app).toContain("event.key.toLowerCase() === 'g'");
    expect(app).toContain('!textEditorFocused');
    expect(app).toContain('!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey');
    expect(app).toContain('shouldToggleStudioGrid(event,editing)');
    expect(app).toContain('this.controller.toggleGrid()');
    expect(app).toContain('this.controller.gridVisible()');
  });

  it('keeps spatial content behind kit drawers and applies UI input precedence', () => {
    const app = source('./app.ts');
    expect(app).toContain('ui.viewport('); expect(app).toContain('surface.draw?.(context,this.#art)');
    expect(app).toContain('this.#root.pointer('); expect(app).toContain('this.#toolPointerOwner===event.pointerId');
    expect(app).toContain('spaceHeld:this.#spaceHeld'); expect(app).toContain('this.#surface?.input?.wheel?.(');
    expect(app).not.toMatch(/\bcontext\.(?:fillRect|strokeRect|fillText|drawImage)\(/u);
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

  it('delegates table wheel and keyboard input to the same retained root', () => {
    const app = source('./app.ts');
    expect(app).toContain('this.#root.wheel('); expect(app).toContain('this.#root.key(event)');
    expect(app).not.toContain('hitStudioCanvasTable'); expect(app).not.toContain('scrollStudioCanvasTable');
  });
});
