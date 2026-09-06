import { compileEmissiveFrames } from './assets/emissive.js';
import { fileURLToPath } from 'node:url';
import {
  TERRAIN_CLIFF_FAMILIES,
  TERRAIN_SURFACE_FAMILIES,
  raisedTerrainProjectionRowsPerLevel,
  type RaisedTerrainFaceProfile,
  type RaisedTerrainFaceRow,
  type RaisedTerrainStairFrames,
} from '@orchard/sim';
import { assetsRoot, loadAssets, loadPalette, readJson } from './assets/load.js';
import { frameKind, variantTopology } from './assets/frame-kind.js';
import { compileBakedShadow } from './assets/baked-shadow.js';
import { sourcePaletteErrors } from './assets/source-palette.js';
import { uiMetadataErrors } from './assets/ui-metadata.js';
import type { AssetSource, PixelGrid } from './assets/types.js';

interface SeasonSource {
  readonly required: readonly string[];
  readonly spring: Readonly<Record<string, string>>;
  readonly summer: Readonly<Record<string, string>>;
  readonly autumn: Readonly<Record<string, string>>;
  readonly winter: Readonly<Record<string, string>>;
}

const seasonNames = ['spring', 'summer', 'autumn', 'winter'] as const;
const outlineCharacters = new Set(['0', '1', '9', 'f', 'j', 'o', 't', 'y', 'D', 'Q', 'R', 'S']);
const audioPatches = new Set(['flute', 'pad', 'pluck', 'bass', 'bells', 'strings', 'accordion', 'woodblock', 'shaker']);
const ambienceTimes = new Set(['dawn', 'day', 'dusk', 'night']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readFolder(folder: string, suffix: string): Promise<unknown[]> {
  const root = new URL(`${folder}/`, assetsRoot);
  const files = (await readdir(root)).filter((name) => name.endsWith(suffix)).sort();
  return await Promise.all(files.map(async (name) => await readJson(new URL(name, root))));
}

function validateSongs(songs: readonly unknown[], errors: string[]): void {
  for (const value of songs) {
    if (!isRecord(value) || typeof value['name'] !== 'string') { errors.push('music: invalid song object'); continue; }
    const name = value['name'];
    if (typeof value['bpm'] !== 'number' || value['bpm'] < 72 || value['bpm'] > 96) errors.push(`${name}: bpm must be 72-96`);
    if (typeof value['swing'] !== 'number' || value['swing'] < 0 || value['swing'] > 0.12) errors.push(`${name}: swing must be 0-0.12`);
    if (value['loopBars'] !== 48 && value['loopBars'] !== 64 && value['loopBars'] !== 96) errors.push(`${name}: theme loop must be 48, 64, or 96 bars`);
    if (!Array.isArray(value['channels']) || !isRecord(value['patterns'])) { errors.push(`${name}: channels/patterns missing`); continue; }
    for (const channel of value['channels']) {
      if (!isRecord(channel) || typeof channel['patch'] !== 'string' || !audioPatches.has(channel['patch'])) errors.push(`${name}: channel uses a patch outside the closed set`);
      if (!isRecord(channel) || !Array.isArray(channel['patterns'])) continue;
      for (const patternName of channel['patterns']) if (typeof patternName !== 'string' || !value['patterns'][patternName]) errors.push(`${name}: missing pattern ${String(patternName)}`);
    }
    for (const [patternName, patternValue] of Object.entries(value['patterns'])) {
      if (!isRecord(patternValue) || typeof patternValue['steps'] !== 'number' || !Array.isArray(patternValue['notes'])) { errors.push(`${name}:${patternName} invalid pattern`); continue; }
      for (const note of patternValue['notes']) {
        if (!Array.isArray(note) || note.length !== 3 || typeof note[0] !== 'number' || typeof note[1] !== 'string' || typeof note[2] !== 'number'
          || note[0] < 0 || note[2] <= 0 || note[0] + note[2] > patternValue['steps']) errors.push(`${name}:${patternName} invalid note`);
      }
    }
  }
}

function validateSfx(sources: readonly unknown[], errors: string[]): void {
  for (const value of sources) {
    if (!isRecord(value) || typeof value['name'] !== 'string') { errors.push('sfx: invalid source object'); continue; }
    const name = value['name'];
    if (!isRecord(value['synth']) || !isRecord(value['jitter'])) { errors.push(`${name}: synth/jitter missing`); continue; }
    for (const field of ['pitch', 'decay', 'gainDb']) {
      const range = value['jitter'][field];
      if (!Array.isArray(range) || range.length !== 2 || !range.every((entry) => typeof entry === 'number')) errors.push(`${name}: jitter.${field} must be a numeric range`);
    }
    if (value['bus'] !== 'sfx' && value['bus'] !== 'ambience') errors.push(`${name}: invalid audio bus`);
    if (typeof value['synth']['frequencyHz'] !== 'number' || value['synth']['frequencyHz'] <= 0) errors.push(`${name}: invalid frequency`);
    if (value['schedule'] !== undefined) {
      if (!isRecord(value['schedule'])) { errors.push(`${name}: schedule must be an object`); continue; }
      const time = value['schedule']['time'];
      const season = value['schedule']['season'];
      if (time !== undefined && (!Array.isArray(time) || time.some((entry) => typeof entry !== 'string' || !ambienceTimes.has(entry)))) errors.push(`${name}: invalid ambience time`);
      if (season !== undefined && (!Array.isArray(season) || season.some((entry) => typeof entry !== 'string' || !seasonNames.includes(entry as typeof seasonNames[number])))) errors.push(`${name}: invalid ambience season`);
    }
  }
}

function validateCanonicalSize(asset: AssetSource, errors: string[]): void {
  const [width, height] = asset.size;
  if (asset.category === 'tiles' && (width !== 16 || height !== 16)) errors.push(`${asset.name}: tiles must be 16x16`);
  if (asset.category === 'characters') {
    const bodyCanvas = width === 16 && height === 32;
    const licensedActionCanvas = asset.sourcePaletteMode === 'exact' && (
      (width === 16 && height === 16)
      || (width === 32 && (height === 32 || height === 40))
      || (width === 48 && height === 48)
      || (width === 64 && height === 64)
    );
    const licensedToolActionCanvas = width === 64 && height === 64
      && asset.name.startsWith('tool_cf_') && asset.sourcePaletteMode === 'exact';
    if (!bodyCanvas && !licensedActionCanvas && !licensedToolActionCanvas) {
      errors.push(`${asset.name}: characters must be 16x32 or an exact licensed 16/32/48/64px action canvas`);
    }
  }
  if (asset.category === 'trees') {
    const valid = (width === 16 && (height === 16 || height === 32))
      || (width === 32 && height === 32)
      || (width === 32 && height === 48 && asset.sourcePaletteMode === 'exact')
      || (width === 32 && height === 64 && asset.sourcePaletteMode === 'exact')
      || (width === 48 && height === 64)
      || (width === 80 && height === 64 && asset.sourcePaletteMode === 'exact');
    if (!valid) errors.push(`${asset.name}: tree size is not a canonical growth-stage size`);
  }
  if (asset.category === 'buildings' && (width % 16 !== 0 || height % 16 !== 0)) {
    errors.push(`${asset.name}: buildings must use 16px multiples`);
  }
  if (asset.anchor[0] < 0 || asset.anchor[1] < 0 || asset.anchor[0] >= width || asset.anchor[1] >= height) {
    errors.push(`${asset.name}: anchor must be inside the asset`);
  }
}

function validateTerrainCliffFamilies(
  assets: readonly AssetSource[],
  paletteColors: Readonly<Record<string, string>>,
  errors: string[],
): void {
  const byName = new Map(assets.map((asset) => [asset.name, asset]));
  const frameContentKey = (assetId: string, frame: number): string | null => {
    const asset = byName.get(assetId);
    const grid = asset?.frames['base']?.[frame];
    if (asset === undefined || grid === undefined) return null;
    return grid.map((row) => [...row].map((pixel) => pixel === '.'
      ? 'transparent'
      : (asset.sourcePalette?.[pixel] ?? paletteColors[pixel] ?? `unknown:${pixel}`).toLowerCase()
    ).join(',')).join(';');
  };
  const validateFrames = (
    familyId: string,
    roleGroup: string,
    assetId: string,
    frames: readonly number[],
  ): void => {
    const asset = byName.get(assetId);
    if (asset === undefined) {
      errors.push(`terrain family ${familyId}:${roleGroup} references missing asset ${assetId}`);
      return;
    }
    const frameCount = asset.frames['base']?.length ?? 0;
    for (const frame of frames) {
      if (!Number.isSafeInteger(frame) || frame < 0 || frame >= frameCount) {
        errors.push(`terrain family ${familyId}:${roleGroup} frame ${frame} is outside ${assetId}:base[0..${Math.max(0, frameCount - 1)}]`);
      } else {
        const pixels = asset.frames['base']?.[frame] ?? [];
        if (pixels.every((row) => [...row].every((pixel) => pixel === '.'))) {
          errors.push(`terrain family ${familyId}:${roleGroup} frame ${frame} in ${assetId} is fully transparent`);
        }
      }
    }
  };
  const crossFamilyCliffRoles = new Map<string, {
    readonly familyId: string;
    readonly role: string;
    readonly assetId: string;
    readonly frame: number;
    readonly intentional: boolean;
  }[]>();
  for (const [familyId, family] of Object.entries(TERRAIN_CLIFF_FAMILIES)) {
    if (!family.available) continue;
    const tileSet = family.tileSet;
    const authoredFaceRows = Object.values(tileSet.faceProfiles).flatMap((profile) => [
      ...profile.rows,
      ...(profile.repeatRows ?? (profile.repeatRow === undefined ? [] : [profile.repeatRow])),
    ]);
    if (raisedTerrainProjectionRowsPerLevel(tileSet) > 0 && authoredFaceRows.length === 0) {
      console.warn(`terrain family ${familyId} projects with an empty face bank`);
    }
    const duplicateRoleFrames = (roleGroup: string, roles: Readonly<Record<string, number>>): void => {
      const firstRole = new Map<number, string>();
      for (const [role, frame] of Object.entries(roles)) {
        const duplicate = firstRole.get(frame);
        if (duplicate !== undefined) {
          errors.push(`terrain family ${familyId}:${roleGroup} roles ${duplicate} and ${role} duplicate frame ${frame}`);
        } else firstRole.set(frame, role);
      }
    };
    duplicateRoleFrames('edges', tileSet.edgeFrames);
    duplicateRoleFrames('insets', tileSet.insetFrames);
    duplicateRoleFrames('ramps', tileSet.rampFrames);
    const rolesByContent = new Map<string, { readonly role: string; readonly assetId: string; readonly frame: number }[]>();
    const collectRole = (assetId: string, role: string, frame: number): void => {
      const key = frameContentKey(assetId, frame);
      if (key === null) return;
      rolesByContent.set(key, [...(rolesByContent.get(key) ?? []), { role, assetId, frame }]);
      const intentional = role.startsWith('ledge.')
        ? new Set(tileSet.ledgeBank?.intentionalRoleFrameReuse ?? []).has(frame)
        : assetId === tileSet.assetId
          && new Set(tileSet.intentionalRoleFrameReuse ?? []).has(frame);
      crossFamilyCliffRoles.set(key, [
        ...(crossFamilyCliffRoles.get(key) ?? []),
        { familyId, role, assetId, frame, intentional },
      ]);
    };
    for (const [role, frame] of Object.entries(tileSet.edgeFrames)) {
      collectRole(tileSet.assetId, `edge.${role}`, frame);
    }
    for (const [profileId, profile] of Object.entries(tileSet.faceProfiles)) {
      for (const row of (profile as RaisedTerrainFaceProfile).rows) row.frames.forEach((frame: number, join: number) => {
        collectRole(tileSet.assetId, `face.${profileId}.${row.id}.${join}`, frame);
      });
      const repeatRows = (profile as RaisedTerrainFaceProfile).repeatRows
        ?? ((profile as RaisedTerrainFaceProfile).repeatRow === undefined
          ? [] : [(profile as RaisedTerrainFaceProfile).repeatRow!]);
      repeatRows.forEach((row, variant) => row.frames.forEach((frame, join) => {
        collectRole(tileSet.assetId, `face.${profileId}.${row.id}_repeat_${variant}.${join}`, frame);
      }));
    }
    for (const [role, frame] of Object.entries(tileSet.insetFrames)) {
      collectRole(tileSet.insetAssetId ?? tileSet.assetId, `inset.${role}`, frame);
    }
    for (const [role, frame] of Object.entries(tileSet.rampFrames)) {
      collectRole(tileSet.rampAssetId ?? tileSet.assetId, `ramp.${role}`, frame);
    }
    if (tileSet.rampBank !== null) {
      for (const [courseId, course] of [
        ['crest', tileSet.rampBank.crest],
        ...tileSet.rampBank.treads.map((course, index) => [`tread_${index}`, course] as const),
        ['base', tileSet.rampBank.base],
      ] as const) {
        collectRole(tileSet.rampBank.assetId, `ramp_bank.${courseId}.left`, course.left);
        course.middle.forEach((frame, index) => collectRole(
          tileSet.rampBank!.assetId, `ramp_bank.${courseId}.middle_${index}`, frame,
        ));
        collectRole(tileSet.rampBank.assetId, `ramp_bank.${courseId}.right`, course.right);
      }
    }
    if (tileSet.ledgeBank !== null && tileSet.ledgeBank !== undefined) {
      for (const [role, frame] of Object.entries(tileSet.ledgeBank.edgeFrames)) {
        collectRole(tileSet.ledgeBank.assetId, `ledge.edge.${role}`, frame);
      }
      for (const [role, frame] of Object.entries(tileSet.ledgeBank.insetFrames)) {
        collectRole(tileSet.ledgeBank.assetId, `ledge.inset.${role}`, frame);
      }
    }
    if (tileSet.stairFrames !== null) for (const [course, frames] of Object.entries(tileSet.stairFrames as RaisedTerrainStairFrames)) {
      frames.forEach((frame: number, lane: number) => collectRole(
        tileSet.stairAssetId ?? tileSet.assetId, `stair.${course}.${lane}`, frame,
      ));
    }
    tileSet.ladderFrames?.forEach((frame, index) => collectRole(
      tileSet.ladderAssetId ?? tileSet.assetId, `ladder.${index}`, frame,
    ));
    for (const roles of rolesByContent.values()) {
      if (roles.length < 2) continue;
      const normalizedRampRoles = roles.map(({ role }) => role.replace(
        /\.(?:crest|tread_\d+|base)\./u, '.course.',
      ));
      const repeatedRampCourse = roles.every(({ role }) => role.startsWith('ramp_bank.'))
        && new Set(normalizedRampRoles).size === 1;
      const declaredPrimaryFrames = new Set<number>(tileSet.intentionalRoleFrameReuse ?? []);
      const ledgeCopyOfDeclaredPrimaryReuse = roles.some(({ role }) => role.startsWith('ledge.'))
        && roles.some(({ assetId }) => assetId === tileSet.assetId)
        && roles.every(({ role, assetId, frame }) => (
          role.startsWith('ledge.')
          || (assetId === tileSet.assetId && declaredPrimaryFrames.has(frame))
        ));
      const intentional = repeatedRampCourse
        || (roles.every(({ role, frame }) => (
          role.startsWith('ramp_bank.')
          && new Set(tileSet.rampBank?.intentionalRoleFrameReuse ?? []).has(frame)
        )))
        || ledgeCopyOfDeclaredPrimaryReuse || (
        roles.every(({ assetId }) => assetId === tileSet.assetId)
        && roles.every(({ frame }) => declaredPrimaryFrames.has(frame))
      );
      if (!intentional) {
        errors.push(`terrain family ${familyId} roles ${roles.map(({ role, assetId, frame }) => `${role}(${assetId}:${frame})`).join(', ')} duplicate pixel content`);
      }
    }
    if ((tileSet.insetAssetId ?? tileSet.assetId) === tileSet.assetId) {
      const edgeFrames = new Set(Object.values(tileSet.edgeFrames));
      for (const [role, frame] of Object.entries(tileSet.insetFrames)) {
        if (edgeFrames.has(frame)) {
          errors.push(`terrain family ${familyId}:inset role ${role} duplicates convex edge frame ${frame}`);
        }
      }
    }
    validateFrames(familyId, 'edges', tileSet.assetId, Object.values(tileSet.edgeFrames));
    validateFrames(
      familyId,
      'faces',
      tileSet.assetId,
      Object.values(tileSet.faceProfiles as Readonly<Record<string, RaisedTerrainFaceProfile>>)
        .flatMap((profile) => [
          ...profile.rows,
          ...(profile.repeatRows ?? (profile.repeatRow === undefined ? [] : [profile.repeatRow])),
        ].flatMap((row: RaisedTerrainFaceRow) => row.frames)),
    );
    validateFrames(
      familyId,
      'insets',
      tileSet.insetAssetId ?? tileSet.assetId,
      Object.values(tileSet.insetFrames),
    );
    validateFrames(
      familyId,
      'ramps',
      tileSet.rampAssetId ?? tileSet.assetId,
      Object.values(tileSet.rampFrames),
    );
    if (tileSet.stairFrames !== null) validateFrames(
      familyId,
      'stairs',
      tileSet.stairAssetId ?? tileSet.assetId,
      Object.values(tileSet.stairFrames).flat(),
    );
    if (tileSet.rampBank !== null) validateFrames(
      familyId,
      'ramp-bank',
      tileSet.rampBank.assetId,
      [tileSet.rampBank.crest, ...tileSet.rampBank.treads, tileSet.rampBank.base]
        .flatMap((course) => [course.left, ...course.middle, course.right]),
    );
    if (tileSet.ledgeBank !== null && tileSet.ledgeBank !== undefined) validateFrames(
      familyId,
      'ledge',
      tileSet.ledgeBank.assetId,
      [...Object.values(tileSet.ledgeBank.edgeFrames), ...Object.values(tileSet.ledgeBank.insetFrames)],
    );
    if (tileSet.ladderFrames !== null) validateFrames(
      familyId,
      'ladders',
      tileSet.ladderAssetId ?? tileSet.assetId,
      tileSet.ladderFrames,
    );
    if (tileSet.waterfallAssetId !== undefined) validateFrames(
      familyId,
      'waterfall',
      tileSet.waterfallAssetId,
      Array.from(
        { length: byName.get(tileSet.waterfallAssetId)?.frames['base']?.length ?? 0 },
        (_, frame) => frame,
      ),
    );
    const primary = byName.get(tileSet.assetId);
    if (primary !== undefined) {
      if (primary.placement?.layer !== 'ground' || primary.placement.blocksMovement !== true) {
        errors.push(`terrain family ${familyId} primary asset ${tileSet.assetId} must be structural ground art`);
      }
      if (!primary.tags?.includes('terrain.cliff')) {
        errors.push(`terrain family ${familyId} primary asset ${tileSet.assetId} must declare terrain.cliff`);
      }
    }
    if (tileSet.ledgeBank !== null && tileSet.ledgeBank !== undefined) {
      const ledge = byName.get(tileSet.ledgeBank.assetId);
      if (ledge !== undefined && (ledge.placement?.layer !== 'ground' || ledge.placement.blocksMovement)) {
        errors.push(`terrain family ${familyId} ledge asset ${tileSet.ledgeBank.assetId} must be non-blocking ground art`);
      }
    }
  }
  for (const roles of crossFamilyCliffRoles.values()) {
    if (new Set(roles.map(({ familyId }) => familyId)).size < 2
      || new Set(roles.map(({ assetId }) => assetId)).size < 2
      || !roles.some(({ role }) => role.startsWith('ledge.'))) continue;
    if (roles.every(({ intentional }) => intentional)) continue;
    errors.push(`terrain families cross-family ledge reuse ${roles.map(({
      familyId, role, assetId, frame,
    }) => `${familyId}.${role}(${assetId}:${frame})`).join(', ')} must be declared per frame`);
  }
  for (const [familyId, family] of Object.entries(TERRAIN_SURFACE_FAMILIES)) {
    validateFrames(familyId, 'surface-fill', family.assetId, [0]);
    validateFrames(familyId, 'surface-fringe', family.sheetAssetId, Object.values(family.fringeFrames));
    for (const [material, bank] of Object.entries(family.rampBanks)) validateFrames(
      familyId,
      `surface-ramp-bank-${material}`,
      bank.assetId,
      [bank.crest, ...bank.treads, bank.base]
        .flatMap((course) => [course.left, ...course.middle, course.right]),
    );
    validateFrames(
      familyId,
      'surface-ledge',
      family.ledgeBank.assetId,
      [...Object.values(family.ledgeBank.edgeFrames), ...Object.values(family.ledgeBank.insetFrames)],
    );
    const surfaceRoles = new Map<string, { readonly label: string; readonly assetId: string; readonly frame: number }[]>();
    const collectSurfaceRole = (assetId: string, role: string, frame: number): void => {
      const key = frameContentKey(assetId, frame);
      if (key === null) return;
      surfaceRoles.set(key, [
        ...(surfaceRoles.get(key) ?? []),
        { label: `${role}(${assetId}:${frame})`, assetId, frame },
      ]);
    };
    for (const [material, bank] of Object.entries(family.rampBanks)) for (const [courseId, course] of [
      ['crest', bank.crest], ...bank.treads.map((course, index) => [`tread_${index}`, course] as const),
      ['base', bank.base],
    ] as const) {
      collectSurfaceRole(bank.assetId, `ramp_bank.${material}.${courseId}.left`, course.left);
      course.middle.forEach((frame, index) => collectSurfaceRole(bank.assetId, `ramp_bank.${material}.${courseId}.middle_${index}`, frame));
      collectSurfaceRole(bank.assetId, `ramp_bank.${material}.${courseId}.right`, course.right);
    }
    for (const [role, frame] of Object.entries(family.ledgeBank.edgeFrames)) {
      collectSurfaceRole(family.ledgeBank.assetId, `ledge.edge.${role}`, frame);
    }
    for (const [role, frame] of Object.entries(family.ledgeBank.insetFrames)) {
      collectSurfaceRole(family.ledgeBank.assetId, `ledge.inset.${role}`, frame);
    }
    for (const roles of surfaceRoles.values()) if (roles.length > 1) {
      const normalized = roles.map(({ label }) => label
        .replace(/\([^)]*\)$/u, '')
        .replace(/\.(?:crest|tread_\d+|base)\./u, '.course.'));
      if (roles.every(({ label }) => label.startsWith('ramp_bank.')) && new Set(normalized).size === 1) continue;
      const declaredRampReuse = roles.every(({ label, assetId, frame }) => (
        label.startsWith('ramp_bank.')
        && Object.values(family.rampBanks).some((bank) => (
          bank.assetId === assetId
          && new Set(bank.intentionalRoleFrameReuse ?? []).has(frame)
        ))
      ));
      if (declaredRampReuse) continue;
      errors.push(`terrain surface family ${familyId} roles ${roles.map(({ label }) => label).join(', ')} duplicate pixel content`);
    }
    for (const assetId of [
      family.assetId,
      family.sheetAssetId,
      family.ledgeBank.assetId,
      ...Object.values(family.rampBanks).map((bank) => bank.assetId),
    ]) {
      const asset = byName.get(assetId);
      if (asset !== undefined && (asset.placement?.layer !== 'ground' || asset.placement.blocksMovement)) {
        errors.push(`terrain surface family ${familyId} asset ${assetId} must be non-blocking ground art`);
      }
    }
  }
}

function validateOrphans(asset: AssetSource, grid: PixelGrid, animation: string, frameIndex: number, errors: string[]): void {
  if (asset.lintAllow?.includes('sparkle') || asset.sourcePaletteMode === 'exact') return;
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = grid[y]?.[x];
      if (!value || value === '.') continue;
      const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const;
      if (!neighbors.some(([nx, ny]) => grid[ny]?.[nx] === value)) {
        errors.push(`${asset.name}:${animation}[${frameIndex}] orphan ${value} at ${x},${y}`);
      }
    }
  }
}

function validateGrid(
  asset: AssetSource,
  grid: PixelGrid,
  animation: string,
  frameIndex: number,
  allowed: ReadonlySet<string>,
  errors: string[],
): void {
  const [width, height] = asset.size;
  if (grid.length !== height) errors.push(`${asset.name}:${animation}[${frameIndex}] expected ${height} rows, got ${grid.length}`);
  for (let row = 0; row < grid.length; row += 1) {
    if (grid[row]?.length !== width) errors.push(`${asset.name}:${animation}[${frameIndex}] row ${row} must be ${width} characters`);
    for (const character of grid[row] ?? '') {
      if (character !== '.' && !allowed.has(character)) errors.push(`${asset.name}:${animation}[${frameIndex}] unknown palette character ${character}`);
    }
  }
  validateOrphans(asset, grid, animation, frameIndex, errors);
  if (asset.category === 'characters' && asset.sourcePaletteMode !== 'exact') {
    let boundary = 0;
    let outlined = 0;
    for (let y = 0; y < grid.length; y += 1) {
      for (let x = 0; x < (grid[y]?.length ?? 0); x += 1) {
        const character = grid[y]?.[x] ?? '.';
        if (character === '.') continue;
        const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const;
        const exposed = neighbors.some(([nx, ny]) => (grid[ny]?.[nx] ?? '.') === '.');
        if (!exposed) continue;
        boundary += 1;
        if (outlineCharacters.has(character)) outlined += 1;
      }
    }
    if (boundary === 0 || outlined / boundary < 0.5) {
      errors.push(`${asset.name}:${animation}[${frameIndex}] character outline coverage is below 50%`);
    }
  }
}

export async function validateAssetSources(): Promise<void> {
  const errors: string[] = [];
  const [assets, palette, seasonSource] = await Promise.all([
    loadAssets(),
    loadPalette(),
    readJson(new URL('seasons.json', assetsRoot)) as Promise<SeasonSource>,
  ]);
  const [songs, sfx] = await Promise.all([
    readFolder('music', '.song.json'),
    readFolder('sfx', '.sfx.json'),
  ]);
  if (Object.keys(palette.colors).length !== 55) errors.push('palette.json must contain the binding 55 colors');
  for (const [character, hex] of Object.entries(palette.colors)) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) errors.push(`palette ${character}: invalid hex ${hex}`);
    if (hex.toLowerCase() === '#000000' || hex.toLowerCase() === '#ffffff') errors.push(`palette ${character}: pure black/white is forbidden`);
  }
  const allowed = new Set([...Object.keys(palette.colors), ...Object.keys(palette.markerDefaults)]);
  const names = new Set<string>();
  for (const asset of assets) {
    if (names.has(asset.name)) errors.push(`${asset.name}: duplicate asset name`);
    names.add(asset.name);
    validateCanonicalSize(asset, errors);
    errors.push(...uiMetadataErrors(asset));
    try { compileBakedShadow(asset, palette, seasonSource); compileEmissiveFrames(asset, palette); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    errors.push(...sourcePaletteErrors(asset, allowed));
    for (const [animation, frames] of Object.entries(asset.frames)) {
      if (frames.length === 0) errors.push(`${asset.name}:${animation} must have at least one frame`);
      frames.forEach((grid, index) => validateGrid(asset, grid, animation, index, allowed, errors));
      const kind = frameKind(asset, animation, frames);
      if (kind === 'state' && frames.length !== 1) errors.push(`${asset.name}:${animation} state must contain exactly one frame`);
      if (kind === 'animation' && asset.animationFps?.[animation] === undefined && asset.fps === undefined) {
        errors.push(`${asset.name}:${animation} animation must declare fps or animationFps`);
      }
      const topology = variantTopology(asset, animation, frames);
      if (topology === 'blob47' && kind !== 'variant') errors.push(`${asset.name}:${animation} blob47 topology must be a variant`);
      if (topology === 'blob47' && asset.autotile !== 'blob47' && frames.length !== 47) {
        errors.push(`${asset.name}:${animation} expanded blob47 variant must contain 47 frames`);
      }
    }
    for (const name of Object.keys(asset.frameKinds ?? {})) if (!asset.frames[name]) errors.push(`${asset.name}: frameKinds references missing group ${name}`);
    for (const name of Object.keys(asset.variantTopologies ?? {})) if (!asset.frames[name]) errors.push(`${asset.name}: variantTopologies references missing group ${name}`);
    for (const name of Object.keys(asset.animationLoop ?? {})) if (!asset.frames[name]) errors.push(`${asset.name}: animationLoop references missing group ${name}`);
    if (asset.autotile === 'blob47' && asset.frames['base']?.length !== 5) {
      errors.push(`${asset.name}: blob47 source must contain five template frames`);
    }
  }
  validateTerrainCliffFamilies(assets, palette.colors, errors);
  for (const season of seasonNames) {
    for (const character of seasonSource.required) {
      const target = seasonSource[season][character];
      if (!target || !palette.colors[target]) errors.push(`seasons.json ${season}: missing valid mapping for ${character}`);
    }
  }
  validateSongs(songs, errors);
  validateSfx(sfx, errors);
  if (errors.length > 0) throw new Error(`Asset validation failed:\n${errors.join('\n')}`);
  console.log(`Validated ${assets.length} art assets, ${songs.length} songs, ${sfx.length} SFX, 55 palette colors, and four seasonal remaps.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await validateAssetSources();
import { readdir } from 'node:fs/promises';
