export type PixelGrid = readonly string[];
export type FrameKind = 'animation' | 'variant' | 'state';
export type UiSizing = 'fixed' | 'nine_slice' | 'corners' | 'segmented';

export interface AssetSource {
  readonly name: string;
  readonly category: string;
  readonly size: readonly [number, number];
  readonly anchor: readonly [number, number];
  readonly collision?: readonly (readonly [number, number, number, number])[];
  readonly autotile?: 'blob47';
  readonly frames: Readonly<Record<string, readonly PixelGrid[]>>;
  readonly fps?: number;
  readonly animationFps?: Readonly<Record<string, number>>;
  readonly animationLoop?: Readonly<Record<string, boolean>>;
  readonly frameKinds?: Readonly<Record<string, FrameKind>>;
  readonly variantTopologies?: Readonly<Record<string, 'blob47'>>;
  readonly markers?: Readonly<Record<string, string>>;
  readonly markerRamps?: Readonly<Record<string, readonly string[]>>;
  /** Native RGB(A) values retained from an owner-licensed source image. */
  readonly sourcePalette?: Readonly<Record<string, string>>;
  readonly lintAllow?: readonly string[];
  readonly tags?: readonly string[];
  readonly placement?: {
    readonly layer?: 'ground' | 'object' | 'canopy' | 'ui';
    readonly footprint?: readonly [number, number];
    readonly blocksMovement?: boolean;
    readonly builderAvailable?: boolean;
  };
  readonly approved?: boolean;
  readonly importedFrom?: string;
  readonly sourcePath?: string;
  readonly sourceRegion?: readonly [number, number, number, number];
  readonly sourceRegions?: Readonly<Record<string, readonly (readonly [number, number, number, number])[]>>;
  readonly sourcePaletteMode?: 'exact';
  readonly charset?: string;
  readonly glyphSize?: readonly [number, number];
  readonly cellSize?: readonly [number, number];
  readonly columns?: number;
  readonly slice?: readonly [number, number, number, number];
  /** Runtime layout intent for UI assets. Required for newly catalogued UI art. */
  readonly uiSizing?: UiSizing;
  /** Complete state contract for a stateful widget; must include idle. */
  readonly uiRequiredStates?: readonly string[];
}

export interface PaletteSource {
  readonly name: string;
  readonly colors: Readonly<Record<string, string>>;
  readonly markerDefaults: Readonly<Record<string, string>>;
}

export interface BuiltFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly durationTicks: number;
}
