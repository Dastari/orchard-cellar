import { readFileSync } from 'node:fs';

type Region = readonly [number, number, number, number];
interface PlainItemIconSource {
  readonly asset: string;
  readonly sourcePath: string;
  readonly sourceRegion: Region;
}

/** Reviewed native-cell correspondence, shared by crop/ore extraction and the
 * pixel regression gate. Generic source filenames do not imply plain pixels. */
export const PLAIN_ITEM_ICON_SOURCES = JSON.parse(readFileSync(
  new URL('./fixtures/plain-item-icon-sources.json', import.meta.url), 'utf8',
)) as readonly PlainItemIconSource[];
const sources = new Map(PLAIN_ITEM_ICON_SOURCES.map((source) => [source.asset, source]));

export function plainItemIconImport<T extends {
  readonly name: string;
  readonly source: string;
  readonly groups: Readonly<Record<string, readonly Region[]>>;
}>(input: T): T {
  const plain = sources.get(input.name);
  if (plain === undefined) return input;
  const base = input.groups.base;
  if (Object.keys(input.groups).length !== 1 || base?.length !== 1
    || base[0]?.[2] !== 16 || base[0]?.[3] !== 16) {
    throw new Error(`${input.name}: reviewed plain icon requires one native 16x16 base frame`);
  }
  return { ...input, source: plain.sourcePath, groups: { base: [plain.sourceRegion] } };
}
