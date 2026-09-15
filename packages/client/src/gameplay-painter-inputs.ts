import type { GameplayCelestialPass } from './gameplay-celestial-pass.js';
import type { generateSurvivalDecorations, CollisionMap, Direction, PlayerState, SpaceDefinition, MiningNodeClass, GeneratedSurvivalDecoration, MapLandmarkInstance, RuntimeObjectProcessor } from '@orchard/sim';
import type { WorldPlaceable, WorldResource } from '@orchard/world-bindings/types';
import type { OverworldView } from './net/overworld-connection.js';
import type { AvatarAnimationController, LocalActionPresentation, RenderTickClock, VisualTickClock, SampledProjectile, SampledRemote } from './net/netcode.js';
import type { WorldVisualBounds } from '@orchard/engine/overworld-art';
import type { GroundChunkCache } from '@orchard/engine/ground-cache';
import type { PointLight, UnifiedLightReceiver } from '@orchard/engine/lighting';
import type { WindTreeSource } from '@orchard/engine/weather-effects';
import type { TerrainArray } from '@orchard/engine/terrain';
import type { LocalProjectilePrediction } from './overworld-prediction.js';
import type { SelectedEntityTarget, TargetableWorldEntity } from './entity-targeting.js';
import type { LiveObjectPresentationCache } from './content/object-presentation.js';
import type { AuthoredActionArt } from './content/action-art.js';

export interface PendingBowProjectile extends LocalProjectilePrediction {
  readonly token: number;
  readonly mounted: boolean;
  readonly ownerProjectileIdsAtRelease: ReadonlySet<bigint>;
  readonly releasedAtAuthorityTick: bigint;
}

export interface RuntimeSurvivalDecoration extends GeneratedSurvivalDecoration {
  readonly landmark?: MapLandmarkInstance;
}

export type RenderWorldResource = WorldResource & { readonly ambientOnly?: boolean };

export interface GameplayPainterInputs {
  readonly terrain: TerrainArray;
  readonly cameraX: number;
  readonly cameraY: number;
  readonly frame: import("@orchard/engine/renderer").RenderFrame;
  readonly scale: number;
  readonly context: CanvasRenderingContext2D;
  readonly seasonalDynamic: boolean;
  readonly localX: number;
  readonly localTerrainContactY: number;
  readonly art: import("@orchard/engine/overworld-art").OverworldArt;
  readonly groundCache: GroundChunkCache;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly debugEntitiesHidden: boolean;
  readonly projectedLocalY: number;
  readonly snapshot: OverworldView;
  readonly celestialPass: GameplayCelestialPass;
  readonly activeSpaceDefinition: SpaceDefinition;
  readonly renderItems: number;
  readonly weatherVisualTick: number;
  readonly lightingPreview: { clockHours: number; continuousDay: number; lunarProgress: number; lunarIllumination: number; cloudCover?: number; cameraX?: number; cameraY?: number; } | null;
  readonly renderWeatherTick: bigint;
  readonly renderWeather: import("@orchard/sim").WeatherVisualState;
  readonly alpha: number;
  readonly dynamicLighting: boolean;
  readonly objectPresentations: LiveObjectPresentationCache;
  readonly lightVisible: import("@orchard/engine/camera").VisibleWorldBounds;
  readonly pointLights: PointLight[];
  readonly projectedLight: (light: PointLight, terrainSampleY?: number, terrainSampleX?:number) => PointLight;
  readonly homesteadSurroundingDecorations: (seed: number) => ReturnType<typeof generateSurvivalDecorations>;
  readonly seed: number;
  readonly topsideDecorations: (snapshot: OverworldView, seed: number) => readonly RuntimeSurvivalDecoration[];
  readonly visible: import("@orchard/engine/camera").VisibleWorldBounds;
  readonly enqueueWorldDepth: (worldX: number, worldFootY: number, item: import("@orchard/engine/renderer").WorldDepthItem, terrainSampleY?: number, unifiedReceiver?: UnifiedLightReceiver, shadowContactY?: number, shadowBody?: import("@orchard/engine/overworld-art").ActorShadowBody) => void;
  readonly visualTickClock: VisualTickClock;
  readonly frameLightingModel: "classic" | "unified";
  readonly drawSouthFacingReceiver: (footX: number, footY: number, draw: () => void, face?: UnifiedLightReceiver) => void;
  readonly nameplates: { x: number; y: number; name: string; offline?: boolean; }[];
  readonly worldResourcesIncludingPersonalQuest: (snapshot: OverworldView) => readonly WorldResource[];
  readonly homesteadSurroundingResources: (seed: number) => readonly RenderWorldResource[];
  readonly liveMapSuppressesGeneratedResource: (snapshot: OverworldView, id: bigint) => boolean;
  readonly windTrees: WindTreeSource[];
  readonly treeShakeRemaining: Map<bigint, number>;
  readonly effectPhase: number;
  readonly miningClassFromWire: (value: string, spaceId: number) => MiningNodeClass;
  readonly cropDefinitionForSnapshot: (snapshot: Pick<OverworldView, "homesteadUpgrades" | "content">, cropKind: string) => import("@orchard/sim").CropDefinition | null;
  readonly renderAuthorityTick: bigint;
  readonly cropAutomaticallyWateredForSnapshot: (snapshot: Pick<OverworldView, "placeables" | "content">, spaceId: number, tileX: number, tileY: number) => boolean;
  readonly cropCalendarOffsetForSnapshot: (snapshot: Pick<OverworldView, "clock" | "environment">) => bigint;
  readonly cropGreenhouseProtectedForSnapshot: (snapshot: Pick<OverworldView, "homesteads" | "placeables" | "content">, spaceId: number) => boolean;
  readonly liveItemContentDefinition: (snapshot: OverworldView, itemKind: string) => import("@orchard/sim").ItemContentDefinition | null;
  readonly projectileDisplay: Map<bigint, SampledProjectile>;
  readonly projectileFlightTicks: Map<bigint, number>;
  readonly projectileHitProgress: Map<bigint, number>;
  readonly renderTickClock: RenderTickClock;
  readonly pendingBowProjectile: PendingBowProjectile | null;
  readonly projectileCollision: CollisionMap;
  readonly animatedOpenChestId: bigint | null;
  readonly closingChestId: bigint | null;
  readonly chestAnimationStartedAtMs: number;
  readonly projectionAt: (worldX: number, worldFootY: number) => number;
  readonly targetableEntities: TargetableWorldEntity[];
  readonly clientProcessorRuntime: (
    snapshot: OverworldView,
    placeable: WorldPlaceable,
  ) => RuntimeObjectProcessor | null;
  readonly npcDisplay: Map<bigint, SampledRemote>;
  readonly previousNpcDisplay: Map<bigint, SampledRemote>;
  readonly renderStarted: number;
  readonly npcHitFeedback: Map<bigint, number>;
  readonly NPC_HIT_HOP_MS: number;
  readonly reducedMotionPreference: MediaQueryList;
  readonly questMarkerForNpc: (snapshot: OverworldView, npcId: bigint) => "offer" | "complete" | null;
  readonly questMarkerAnchors: { x: number; y: number; kind: "offer" | "complete"; }[];
  readonly projectedWorldY: (worldX: number, worldFootY: number) => number;
  readonly projectTargetable: (entity: TargetableWorldEntity, worldX: number, worldFootY: number) => TargetableWorldEntity;
  readonly horseAnimationFrame: number;
  readonly targetableFromVisualBounds: (target: SelectedEntityTarget, bounds: WorldVisualBounds | null, fallbackX: number, fallbackY: number, fallback: { readonly halfWidth: number; readonly height: number; }) => TargetableWorldEntity;
  readonly wildlifeProfile: (snapshot: OverworldView, npcId: bigint) => { readonly species: string; readonly variant: number; } | null;
  readonly NPC_HIT_FLASH_MS: number;
  readonly remoteDisplay: Map<string, SampledRemote>;
  readonly previousRemoteDisplay: Map<string, SampledRemote>;
  readonly renderedLocal: { readonly x: number; readonly y: number; } | null;
  readonly renderedPlayerAnchors: Map<string, { readonly x: number; readonly y: number; }>;
  readonly equippedLightRow: (snapshot: OverworldView) => { id: string; identity: import("spacetimedb").Identity; slot: number; itemKind: string; quantity: number; durability: number; lit: boolean; } | null;
  readonly selectedItem: (snapshot: OverworldView) => string;
  readonly lightPreviewKind: "lantern" | "torch" | null;
  readonly predicted: PlayerState | null;
  readonly liveEquippedItemFacing: (snapshot: OverworldView, itemKind: string, characterFacing: Direction, aimedFacing: Direction | null) => Direction;
  readonly cursorFacing: () => Direction | null;
  readonly previousPredicted: PlayerState | null;
  readonly profileName: (profiles: OverworldView["profiles"], identity: string) => string;
  readonly avatarAnimations: Map<string, AvatarAnimationController>;
  readonly bowChargeStartedAtMs: number | null;
  readonly localActionPresentation: LocalActionPresentation;
  readonly authoredActionArt: AuthoredActionArt;
  readonly unknownActionKinds: Set<string>;
  readonly currentBowChargeMs: (nowMs?: number) => number;
}
