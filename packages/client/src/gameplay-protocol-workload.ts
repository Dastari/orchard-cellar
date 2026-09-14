import { atlasPageDiagnostics, type OverworldWindow } from '@orchard/ui';
import { DAYS_PER_SEASON, SEASONS } from '@orchard/sim';
import type { RenderMetrics } from '@orchard/engine/metrics';
import { worldPassLayout, type UnifiedRenderer } from '@orchard/engine/renderer';
import type { GameplayCelestialPass } from './gameplay-celestial-pass.js';
import type { ProtocolGameplay } from './gameplay-render-protocol.js';
import { atlasRequestIdentity } from './render-protocol-asset-requests.js';
import { waitForProtocolRestore } from './render-protocol-restore.js';
import type { ProtocolWorkloadIdentity } from './render-protocol-workload.js';
import type { ProtocolWorkloadSource } from './render-protocol-workload-probe.js';

export interface ProtocolLightingPreview {
  clockHours: number; continuousDay: number; lunarProgress: number; lunarIllumination: number;
  cloudCover?: number; cameraX?: number; cameraY?: number;
}
interface WorkloadInputs {
  readonly renderer: UnifiedRenderer;
  readonly pass: GameplayCelestialPass;
  readonly cameraX: number;
  readonly cameraY: number;
  readonly zoom: number;
  readonly seed: number;
  readonly contentRevision: string;
  readonly mapRevision: number;
  readonly mapContentHash: string;
  readonly resourceRevision: number;
  readonly uiWindow: OverworldWindow | null;
  setUiWindow(value: OverworldWindow | null): void;
  readonly playerIdentity: string | null;
  readonly lightingPreview: ProtocolLightingPreview | null;
  readonly lightPreview: 'lantern' | 'torch' | null;
  pondTies(): ReadonlySet<string | number>;
  setLightingPreview(value: ProtocolLightingPreview | null): void;
  setLightPreview(value: 'lantern' | 'torch' | null): void;
}
/** One suite pins the camera origin, artwork season and presentation clock.
 * Only presentation overrides change; keyboard walking still uses authority
 * collision. An unsuitable location is reported as unqualified by the buffer. */
export function createGameplayProtocolWorkload(input: WorkloadInputs) {
  return async (metrics: RenderMetrics, game: ProtocolGameplay) => {
    const initial = game.diagnostics().lighting;
    const priorSky = input.lightingPreview, priorLight = input.lightPreview, priorWindow = input.uiWindow;
    let registryHash = input.contentRevision, mapHash = input.mapContentHash;
    let mapRevision = input.mapRevision, resources = input.resourceRevision;
    let revision = `${registryHash}:${mapHash}:${mapRevision}:${resources}`;
    const sceneRevision = () => {
      if (registryHash !== input.contentRevision || mapHash !== input.mapContentHash
        || mapRevision !== input.mapRevision || resources !== input.resourceRevision) {
        registryHash = input.contentRevision; mapHash = input.mapContentHash;
        mapRevision = input.mapRevision; resources = input.resourceRevision;
        revision = `${registryHash}:${mapHash}:${mapRevision}:${resources}`;
      }
      return revision;
    };
    const seasons = new Set(atlasPageDiagnostics().pages.map(({ url }) => atlasRequestIdentity(url)?.season).filter(Boolean));
    const season = seasons.size === 1 ? [...seasons][0]! : null;
    const seasonIndex = SEASONS.findIndex((value) => value === season);
    if (seasonIndex < 0 || input.playerIdentity === null) throw new Error('render_protocol_scene_identity_unavailable');
    const x = input.cameraX, y = input.cameraY;
    const preview: ProtocolLightingPreview = { continuousDay: (seasonIndex + 0.5) * DAYS_PER_SEASON,
      clockHours: 17, lunarProgress: 0.5, lunarIllumination: 1, cloudCover: 0, cameraX: x, cameraY: y };
    const identity: ProtocolWorkloadIdentity = { seed: input.seed, season: season!, contentRevision: sceneRevision(),
      route: `square-camera-v1:${x}:${y}` };
    let disposed = false;
    const restore = () => {
      if (disposed) return;
      disposed = true; input.setUiWindow(priorWindow); input.setLightingPreview(priorSky); input.setLightPreview(priorLight);
      game.setLightingModel(initial.model); game.setLightingQuality(initial.requestedQuality);
    };
    try {
      input.setUiWindow(null); input.setLightingPreview(preview); input.setLightPreview('lantern');
      game.setLightingModel('unified'); game.setLightingQuality('dynamic');
      await waitForProtocolRestore(metrics, game);
      const referenceCasters = input.pass.renderer?.scene.diagnostics.staticCasters ?? 0;
      const pondTies = input.pondTies();
      const playerTie = `player:${input.playerIdentity}`;
      let layout = worldPassLayout(input.renderer.cssWidth, input.renderer.cssHeight, input.renderer.dpr, input.zoom, input.renderer.worldScale);
      let started: number | null = null, elapsed = 0;
      const source: ProtocolWorkloadSource = {
        playerTie, pondTies, season: season!, assetSeason: season, get contentRevision() { return sceneRevision(); },
        get cameraElapsedMs() { return elapsed; },
        get cameraX() { return input.cameraX; }, get cameraY() { return input.cameraY; },
        get worldWidth() { return layout.width; }, get worldHeight() { return layout.height; },
        get carriedLight() { return input.lightPreview === 'lantern'; },
        get staticCasters() { return input.pass.renderer?.scene.diagnostics.staticCasters ?? referenceCasters; },
      };
      return {
        identity, source,
        densityEvidence: { preflightDynamicCasters: referenceCasters,
          scope: 'Dynamic uses the submitted frame caster count; Basic and Classic reuse the same scene preflight count without retaining lighting surfaces' },
        begin() {
          started = null; elapsed = 0; preview.cameraX = x; preview.cameraY = y; preview.clockHours = 17;
          layout = worldPassLayout(input.renderer.cssWidth, input.renderer.cssHeight, input.renderer.dpr, input.zoom, input.renderer.worldScale);
        },
        advance(timestamp: number) {
          started ??= timestamp;
          elapsed = timestamp - started;
          const leg = Math.floor(elapsed / 625) % 4;
          const distance = elapsed % 625 / 625 * 20;
          preview.cameraX = x + (leg === 0 ? distance : leg === 1 ? 20 : leg === 2 ? 20 - distance : 0);
          preview.cameraY = y + (leg === 0 ? 0 : leg === 1 ? distance : leg === 2 ? 20 : 20 - distance);
          // Deliberate repeatable sunset RGB step, ten seconds into the active
          // sample. The RGB revision witness, not this command, detects it.
          preview.clockHours = elapsed >= 15_000 ? 17.25 : 17;
        },
        dispose: restore,
      };
    } catch (error) { restore(); throw error; }
  };
}
export type GameplayProtocolWorkload = Awaited<ReturnType<ReturnType<typeof createGameplayProtocolWorkload>>>;
