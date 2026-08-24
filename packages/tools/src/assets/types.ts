export type PixelGrid = readonly string[];

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
  readonly markers?: Readonly<Record<string, string>>;
  readonly markerRamps?: Readonly<Record<string, readonly string[]>>;
  readonly lintAllow?: readonly string[];
  readonly approved?: boolean;
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
