import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import evidenceJson from '../../../scripts/studio-browser-acceptance-evidence.json';
import canvasEvidenceJson from '../../../scripts/studio-canvas-browser-evidence.json';
import { StudioToolRegistry, registerBuiltinStudioTools } from './shell/tool-registry.js';

const EXPECTED_ANONYMOUS_ROUTES = [
  '/build/map', '/build/map/terrain-lab', '/build/map/procedural-world', '/build/object',
  '/author/items', '/author/npcs', '/author/dialogue', '/author/quests', '/author/character',
  '/author/audio', '/author/ui-lab', '/build/tiles', '/author/world-tables', '/author/pack',
] as const;
const EXPECTED_PRIVILEGED_ROUTES = [
  '/operate/players', '/operate/playbooks', '/operate/membership', '/observe/world',
  '/operate/containers', '/operate/objects', '/operate/npcs', '/operate/world',
] as const;

const evidence = evidenceJson as {
  readonly schemaVersion: number;
  readonly anonymousRoutes: readonly string[];
  readonly privilegedRoutesRejectedAnonymously: readonly string[];
  readonly allAnonymousRoutesRendered: boolean;
  readonly allConnectButtonsDisabledInSandbox: boolean;
  readonly liveOrOidcRequests: number;
  readonly consoleErrors: number;
  readonly pageErrors: number;
  readonly split: Record<string, boolean>;
  readonly keyboardAndSearch: Record<string, boolean | string>;
  readonly publicStaticValidation: Record<string, boolean | string>;
};

const canvasEvidence = canvasEvidenceJson as {
  readonly schemaVersion: number;
  readonly assertions: {
    readonly bodyChildren: readonly string[];
    readonly bodyDescendantCount: number;
    readonly canvasCount: number;
    readonly htmlUiElementCount: number;
    readonly canvasReady: boolean;
    readonly desktop: {
      readonly alphaGridWorkspace: boolean;
      readonly typedDefinitionInspector: boolean;
      readonly tableSelectionAndWheelPageScroll: boolean;
    };
    readonly drawerResize: {
      readonly leftBefore: number;
      readonly leftAfterPointerDrag: number;
      readonly survivedReload: boolean;
      readonly consoleErrors: number;
    };
    readonly toolRail: {
      readonly routeButtons: string;
      readonly canvasTooltip: boolean;
    };
    readonly anonymousLiveAdapterConstructed: boolean;
    readonly consoleErrors: number;
    readonly consoleWarnings: number;
  };
  readonly screenshots: readonly string[];
};

describe('docs 55/56 Studio acceptance surface', () => {
  it('keeps the checked browser route evidence synchronized with the registry', () => {
    const registry = new StudioToolRegistry();
    registerBuiltinStudioTools(registry);
    expect(registry.routes(null).map(({ path }) => path)).toEqual(EXPECTED_ANONYMOUS_ROUTES);
    expect(registry.routes('owner').map(({ path }) => path).filter((path) => !EXPECTED_ANONYMOUS_ROUTES.includes(path as typeof EXPECTED_ANONYMOUS_ROUTES[number])))
      .toEqual(EXPECTED_PRIVILEGED_ROUTES);
    expect(evidence.schemaVersion).toBe(1);
    expect(evidence.anonymousRoutes).toEqual(EXPECTED_ANONYMOUS_ROUTES);
    expect(evidence.privilegedRoutesRejectedAnonymously).toEqual(EXPECTED_PRIVILEGED_ROUTES);
  });

  it('requires a clean adapter-free anonymous browser result', () => {
    expect(evidence).toMatchObject({
      allAnonymousRoutesRendered: true,
      allConnectButtonsDisabledInSandbox: true,
      liveOrOidcRequests: 0,
      consoleErrors: 0,
      pageErrors: 0,
    });
    expect(Object.values(evidence.split).every(Boolean)).toBe(true);
    expect(evidence.keyboardAndSearch).toMatchObject({
      paletteShortcutWorked: true,
      globalSearchShortcutWorked: true,
      tileSearchNavigatedTo: '/build/tiles',
      authorModeShortcutNavigatedTo: '/author/items',
    });
  });

  it('keeps all built-in tools lazy and the live connection behind explicit Connect', () => {
    const canvasTools = readFileSync(new URL('./shell/builtin-canvas-tools.ts', import.meta.url), 'utf8');
    const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
    const toolIds = ['map', 'object', 'tiles', 'character', 'audio', 'ui-lab',
      'items', 'npc-studio', 'dialogue-graph', 'quest-editor', 'world-tables', 'pack-studio',
      'players', 'playbooks', 'membership', 'observe', 'containers', 'objects', 'npcs', 'world'] as const;
    expect(toolIds).toHaveLength(20);
    expect(new Set(toolIds).size).toBe(20);
    for (const id of toolIds) {
      expect(canvasTools).toContain(`'${id}'`);
    }
    expect(canvasTools).toMatch(/registry\.register\([^,]+, \(\) => import\(/u);
    expect(canvasTools).not.toContain('/view.js');
    expect(main).toContain("await import('./shell/studio-connection.js')");
    expect(main).not.toMatch(/^import .*studio-connection/mu);
  });

  it('guards the sole-canvas visual evidence and requested editor-shell interactions', () => {
    expect(canvasEvidence.schemaVersion).toBe(1);
    expect(canvasEvidence.assertions).toMatchObject({
      bodyChildren: ['CANVAS'],
      bodyDescendantCount: 1,
      canvasCount: 1,
      htmlUiElementCount: 0,
      canvasReady: true,
      desktop: {
        alphaGridWorkspace: true,
        typedDefinitionInspector: true,
        tableSelectionAndWheelPageScroll: true,
      },
      drawerResize: {
        survivedReload: true,
        consoleErrors: 0,
      },
      toolRail: {
        routeButtons: 'icon-only STUDIO_TOOL_ICONS',
        canvasTooltip: true,
      },
      anonymousLiveAdapterConstructed: false,
      consoleErrors: 0,
      consoleWarnings: 0,
    });
    expect(canvasEvidence.assertions.drawerResize.leftAfterPointerDrag)
      .toBeGreaterThan(canvasEvidence.assertions.drawerResize.leftBefore);
    expect(canvasEvidence.screenshots.length).toBeGreaterThanOrEqual(9);
  });

  it('records the canonical public static header/health result', () => {
    expect(evidence.publicStaticValidation).toEqual({
      origin: 'https://cellar.dastari.net',
      csp: true,
      noStore: true,
      referrerPolicy: true,
      contentTypeOptions: true,
      sameOriginHealth: true,
    });
  });
});
