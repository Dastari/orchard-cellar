export interface MapObjectSource {
  readonly asset: string;
  readonly animation: string;
  readonly x: number;
  readonly y: number;
}

export interface MapTransitionSource {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly target: 'estate' | 'cellar';
}

export interface MapSource {
  readonly name: 'estate' | 'cellar';
  readonly size: readonly [number, number];
  readonly legend: Readonly<Record<string, string>>;
  readonly layers: Readonly<Record<'ground' | 'detail' | 'canopy', readonly string[]>>;
  readonly objects: readonly MapObjectSource[];
  readonly transitions: readonly MapTransitionSource[];
}

export async function loadGeneratedMap(name: MapSource['name']): Promise<MapSource> {
  const response = await fetch(`/generated/maps/${name}.map.json`);
  if (!response.ok) throw new Error(`Unable to load authored map ${name}: ${response.status}`);
  const source = await response.json() as MapSource;
  if (source.name !== name || source.size.length !== 2) throw new Error(`Invalid authored map header: ${name}`);
  for (const layerName of ['ground', 'detail', 'canopy'] as const) {
    const rows = source.layers[layerName];
    if (rows.length !== source.size[1] || rows.some((row) => row.length !== source.size[0])) {
      throw new Error(`Invalid ${name} ${layerName} dimensions`);
    }
  }
  return source;
}
