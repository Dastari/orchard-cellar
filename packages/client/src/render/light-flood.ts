/** Effectively continuous 8-bit falloff after the light-only layer is
 * bilinear composited. The flood itself remains integer and allocation-free. */
export const LIGHT_BANDS = 255;
export const LIGHT_OPEN = 0;
export const LIGHT_HARD_BLOCKER = 1;
export const LIGHT_SOFT_ATTENUATOR = 2;
export const LIGHT_SPRITE_BLOCKER = 3;
/** A tree casts a long ground column from only its authoritative trunk
 * collision footprint. The canopy remains an elevated receiver and therefore
 * neither widens the column nor receives the tree's own shadow. */
export const LIGHT_TRUNK_BLOCKER = 4;
/** A raised terrain face receives light from its visible southern side while
 * remaining opaque to the plateau and ground behind it. */
export const LIGHT_CLIFF_FACE_BLOCKER = 5;
export const SOFT_ATTENUATION_PER_MILLE = 550;
export const TRUNK_SHADOW_LENGTH_TEXELS = 64;
const TRUNK_SHADOW_MAX_OPACITY = 1000;

export type LightFacing = 'up' | 'right' | 'down' | 'left';
export type LightProfile = 'steady' | 'flame' | 'pulse';

export interface FloodLight {
  readonly centerX: number;
  readonly centerY: number;
  /** Ground-contact Y used for directional receiver lighting. This can differ
   * from the luminous sprite position of a carried torch or lantern. */
  readonly receiverDirectionCenterY?: number;
  readonly radius: number;
  readonly color: { readonly r: number; readonly g: number; readonly b: number };
  readonly strengthPerMille?: number;
  readonly facing?: LightFacing;
  readonly profile?: LightProfile;
}

const NEIGHBOR_X = new Int8Array([-1, 0, 1, -1, 1, -1, 0, 1]);
const NEIGHBOR_Y = new Int8Array([-1, -1, -1, 0, 0, 1, 1, 1]);
const NEIGHBOR_COST = new Uint8Array([3, 2, 3, 2, 2, 3, 2, 3]);
const VISIBILITY_OCTANTS = [
  [1, 0, 0, 1], [0, 1, 1, 0], [0, -1, 1, 0], [-1, 0, 0, 1],
  [-1, 0, 0, -1], [0, -1, -1, 0], [0, 1, -1, 0], [1, 0, 0, -1],
] as const;

function facingOffset(facing: LightFacing | undefined): readonly [number, number] {
  if (facing === 'up') return [0, -1];
  if (facing === 'right') return [1, 0];
  if (facing === 'down') return [0, 1];
  if (facing === 'left') return [-1, 0];
  return [0, 0];
}

function quantizedBand(strength: number): number {
  return Math.max(0, Math.min(LIGHT_BANDS, Math.round(strength * LIGHT_BANDS / 1000)));
}

const MAX_LIGHT_STRENGTH = 1200;

/** Reusable descending-strength bucket flood. Integer light strengths make a
 * 1,201-bucket queue cheaper than a comparison heap, while preserving the same
 * best-path result and one active node per texel. */
export class QuantizedLightFlood {
  private bestStrength = new Uint16Array(0);
  private bestEpoch = new Uint32Array(0);
  private finalizedEpoch = new Uint32Array(0);
  private visibleEpoch = new Uint32Array(0);
  private queuedEpoch = new Uint32Array(0);
  private queuePrevious = new Int32Array(0);
  private queueNext = new Int32Array(0);
  private bucketHeads = new Int32Array(MAX_LIGHT_STRENGTH + 1);
  private openPathBands = new Uint8Array(0);
  private trunkShadowEpoch = new Uint32Array(0);
  private trunkShadowOpacity = new Uint16Array(0);
  private trunkShadowOwner = new Uint16Array(0);
  private readonly visibleReceiverOwnerEpoch = new Uint32Array(0x10000);
  private readonly bandRed = new Uint8Array(LIGHT_BANDS + 1);
  private readonly bandGreen = new Uint8Array(LIGHT_BANDS + 1);
  private readonly bandBlue = new Uint8Array(LIGHT_BANDS + 1);
  private readonly bandLuma = new Uint8Array(LIGHT_BANDS + 1);
  private southFacePixels: Uint8Array | null = null;
  private southFaceWidth = 0;
  private southFaceSourceX = 0;
  private southFaceSourceY = 0;
  private epoch = 0;
  private strongestBucket = 0;
  private visitedTexels = 0;

  get lastVisitedTexels(): number {
    return this.visitedTexels;
  }

  apply(
    pixels: Uint8ClampedArray,
    haloPixels: Uint8ClampedArray | null,
    width: number,
    height: number,
    light: FloodLight,
    occlusion: Uint8Array,
    occlusionPrefix: Uint32Array | null = null,
    trunkOwners: Uint16Array | null = null,
    receiverOwners: Uint16Array | null = null,
    trunkCellIndices: Uint32Array | null = null,
    trunkCellCount = 0,
    relitReceiverOwners: Uint16Array | null = null,
    southFacePixels: Uint8Array | null = null,
  ): void {
    const cellCount = width * height;
    if (cellCount <= 0 || pixels.length < cellCount * 4 || occlusion.length < cellCount) return;
    this.resize(cellCount);
    this.begin();
    this.prepareColorBands(light);
    this.southFacePixels = southFacePixels !== null && southFacePixels.length >= cellCount
      ? southFacePixels : null;
    this.southFaceWidth = width;
    this.visitedTexels = 0;

    const [offsetX, offsetY] = facingOffset(light.facing);
    const centerX = Math.max(0, Math.min(width - 1, light.centerX + offsetX));
    const centerY = Math.max(0, Math.min(height - 1, light.centerY + offsetY));
    this.southFaceSourceX = centerX;
    this.southFaceSourceY = Math.max(
      0,
      Math.min(height - 1, (light.receiverDirectionCenterY ?? light.centerY) + offsetY),
    );
    const initialStrength = Math.max(0, Math.min(MAX_LIGHT_STRENGTH, Math.round(light.strengthPerMille ?? 1000)));
    if (initialStrength === 0) return;
    this.stampFlameHalo(haloPixels, width, height, centerX, centerY, light, initialStrength);
    const radiusCost = Math.max(1, Math.round(Math.max(0.25, light.radius) * 2));
    const reach = Math.ceil(light.radius * initialStrength / 1000);
    const minX = Math.max(0, Math.floor(centerX - reach));
    const minY = Math.max(0, Math.floor(centerY - reach));
    const maxX = Math.min(width - 1, Math.ceil(centerX + reach));
    const maxY = Math.min(height - 1, Math.ceil(centerY + reach));
    if (!this.regionHasOcclusion(occlusion, occlusionPrefix, width, minX, minY, maxX, maxY)) {
      this.applyOpen(
        pixels, haloPixels, width, centerX, centerY,
        minX, minY, maxX, maxY, radiusCost, initialStrength, light,
      );
      return;
    }

    const lineOfSightOriginX = Math.round(centerX);
    const lineOfSightOriginY = Math.round(centerY);
    const occlusionKinds = this.regionOcclusionKinds(occlusion, width, minX, minY, maxX, maxY);
    const hasDirectionalBlockers = (occlusionKinds
      & ((1 << LIGHT_HARD_BLOCKER) | (1 << LIGHT_SPRITE_BLOCKER)
        | (1 << LIGHT_CLIFF_FACE_BLOCKER))) !== 0;
    const hasSoftAttenuators = (occlusionKinds & (1 << LIGHT_SOFT_ATTENUATOR)) !== 0;
    const hasTrunkBlockers = (occlusionKinds & (1 << LIGHT_TRUNK_BLOCKER)) !== 0;
    if (hasDirectionalBlockers) this.buildVisibility(
      width, height, lineOfSightOriginX, lineOfSightOriginY, reach, occlusion,
    );
    if (hasDirectionalBlockers && trunkOwners !== null && receiverOwners !== null) {
      this.buildVisibleReceiverOwners(
        occlusion, trunkOwners, trunkCellIndices, trunkCellCount,
      );
    }
    if (hasTrunkBlockers && trunkOwners !== null) this.buildTrunkShadows(
      width, height, centerX, centerY, minX, minY, maxX, maxY,
      occlusion, trunkOwners, trunkCellIndices, trunkCellCount,
    );
    if ((hasDirectionalBlockers || hasTrunkBlockers) && !hasSoftAttenuators) {
      this.applyOpen(
        pixels, haloPixels, width, centerX, centerY,
        minX, minY, maxX, maxY, radiusCost, initialStrength, light,
        hasDirectionalBlockers, receiverOwners, occlusion, relitReceiverOwners, trunkOwners,
      );
      return;
    }
    this.offerFractionalSeeds(
      pixels, haloPixels, width, height, centerX, centerY,
      radiusCost, initialStrength, light, occlusion,
    );
    while (this.strongestBucket > 0) {
      const index = this.pop();
      const strength = this.bestStrength[index] ?? 0;
      const x = index % width;
      const y = Math.floor(index / width);
      if (hasDirectionalBlockers && this.visibleEpoch[index] !== this.epoch) continue;
      this.writeLight(pixels, haloPixels, index, light, strength);
      this.visitedTexels += 1;
      for (let neighbor = 0; neighbor < NEIGHBOR_X.length; neighbor += 1) {
        const nextX = x + (NEIGHBOR_X[neighbor] ?? 0);
        const nextY = y + (NEIGHBOR_Y[neighbor] ?? 0);
        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
        const distanceLoss = Math.ceil(1000 * (NEIGHBOR_COST[neighbor] ?? 2) / radiusCost);
        let nextStrength = strength - distanceLoss;
        if (nextStrength <= 0) continue;
        const nextIndex = nextY * width + nextX;
        const blocker = occlusion[nextIndex] ?? LIGHT_OPEN;
        if (blocker === LIGHT_SOFT_ATTENUATOR) {
          nextStrength = Math.floor(nextStrength * SOFT_ATTENUATION_PER_MILLE / 1000);
          if (nextStrength <= 0) continue;
        }
        if (this.isOpaqueBlocker(blocker)
          && hasDirectionalBlockers && this.visibleEpoch[nextIndex] !== this.epoch) continue;
        if (this.isOpaqueBlocker(blocker)) {
          this.offerTerminal(pixels, haloPixels, nextIndex, light, nextStrength);
        } else {
          this.offer(nextIndex, nextStrength);
        }
      }
    }
  }

  private offerFractionalSeeds(
    pixels: Uint8ClampedArray,
    haloPixels: Uint8ClampedArray | null,
    width: number,
    height: number,
    centerX: number,
    centerY: number,
    radiusCost: number,
    initialStrength: number,
    light: FloodLight,
    occlusion: Uint8Array,
  ): void {
    const left = Math.floor(centerX);
    const right = Math.ceil(centerX);
    const top = Math.floor(centerY);
    const bottom = Math.ceil(centerY);
    for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const dx = Math.abs(x - centerX);
      const dy = Math.abs(y - centerY);
      const pathCost = Math.max(dx, dy) * 2 + Math.min(dx, dy);
      const strength = initialStrength - Math.ceil(1000 * pathCost / radiusCost);
      if (strength <= 0) continue;
      const index = y * width + x;
      const blocker = occlusion[index] ?? LIGHT_OPEN;
      if (this.isOpaqueBlocker(blocker)) {
        this.offerTerminal(pixels, haloPixels, index, light, strength);
      } else {
        this.offer(index, blocker === LIGHT_SOFT_ATTENUATOR
          ? Math.floor(strength * SOFT_ATTENUATION_PER_MILLE / 1000)
          : strength);
      }
    }
  }

  private regionOcclusionKinds(
    occlusion: Uint8Array,
    width: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ): number {
    let kinds = 0;
    for (let y = minY; y <= maxY; y += 1) {
      const row = y * width;
      for (let x = minX; x <= maxX; x += 1) kinds |= 1 << (occlusion[row + x] ?? LIGHT_OPEN);
    }
    return kinds;
  }

  private buildVisibility(
    width: number,
    height: number,
    centerX: number,
    centerY: number,
    radius: number,
    occlusion: Uint8Array,
  ): void {
    if (centerX < 0 || centerY < 0 || centerX >= width || centerY >= height) return;
    this.visibleEpoch[centerY * width + centerX] = this.epoch;
    for (const [xx, xy, yx, yy] of VISIBILITY_OCTANTS) {
      this.castVisibilityOctant(
        width, height, centerX, centerY, 1, 1, 0, radius,
        xx, xy, yx, yy, occlusion,
      );
    }
  }

  /** A silhouette's source-facing cells establish direct visibility for the
   * whole elevated receiver. This preserves the authored long umbra on the
   * ground while preventing that same umbra from being multiplied over the
   * caster's front-facing artwork. */
  private buildVisibleReceiverOwners(
    occlusion: Uint8Array,
    casterOwners: Uint16Array,
    casterCellIndices: Uint32Array | null,
    casterCellCount: number,
  ): void {
    const candidateCount = casterCellIndices === null ? occlusion.length : casterCellCount;
    for (let candidate = 0; candidate < candidateCount; candidate += 1) {
      const index = casterCellIndices === null ? candidate : (casterCellIndices[candidate] ?? 0);
      if (occlusion[index] !== LIGHT_SPRITE_BLOCKER || this.visibleEpoch[index] !== this.epoch) continue;
      const owner = casterOwners[index] ?? 0;
      if (owner !== 0) this.visibleReceiverOwnerEpoch[owner] = this.epoch;
    }
  }

  /** Projects a strong column from only the far edge of each trunk footprint.
   * The authored canopy never participates, preserving a narrow collision-width
   * shadow while retaining the long black columns requested by art direction. */
  private buildTrunkShadows(
    width: number,
    height: number,
    centerX: number,
    centerY: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    occlusion: Uint8Array,
    trunkOwners: Uint16Array,
    trunkCellIndices: Uint32Array | null,
    trunkCellCount: number,
  ): void {
    const candidateCount = trunkCellIndices === null ? width * height : trunkCellCount;
    for (let candidate = 0; candidate < candidateCount; candidate += 1) {
      const index = trunkCellIndices === null ? candidate : (trunkCellIndices[candidate] ?? 0);
      if (occlusion[index] !== LIGHT_TRUNK_BLOCKER) continue;
      const x = index % width;
      const y = Math.floor(index / width);
      if (x < minX || y < minY || x > maxX || y > maxY) continue;
      const owner = trunkOwners[index] ?? 0;
      if (owner === 0) continue;
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.25) continue;
      const unitX = dx / distance;
      const unitY = dy / distance;
      // Interior trunk cells do not cast their own duplicate ray; only the
      // silhouette edge facing away from this light projects onto the ground.
      const outwardX = Math.round(x + unitX);
      const outwardY = Math.round(y + unitY);
      if (outwardX >= 0 && outwardY >= 0 && outwardX < width && outwardY < height) {
        const outwardIndex = outwardY * width + outwardX;
        if (occlusion[outwardIndex] === LIGHT_TRUNK_BLOCKER
          && trunkOwners[outwardIndex] === owner) continue;
      }
      for (let step = 1; step <= TRUNK_SHADOW_LENGTH_TEXELS; step += 1) {
        const shadowX = Math.round(x + unitX * step);
        const shadowY = Math.round(y + unitY * step);
        if (shadowX < minX || shadowY < minY || shadowX > maxX || shadowY > maxY
          || shadowX < 0 || shadowY < 0 || shadowX >= width || shadowY >= height) continue;
        const shadowIndex = shadowY * width + shadowX;
        if (occlusion[shadowIndex] === LIGHT_TRUNK_BLOCKER
          && trunkOwners[shadowIndex] === owner) continue;
        const opacity = TRUNK_SHADOW_MAX_OPACITY;
        if (this.trunkShadowEpoch[shadowIndex] !== this.epoch
          || opacity > (this.trunkShadowOpacity[shadowIndex] ?? 0)) {
          this.trunkShadowEpoch[shadowIndex] = this.epoch;
          this.trunkShadowOpacity[shadowIndex] = opacity;
          this.trunkShadowOwner[shadowIndex] = owner;
        }
      }
    }
  }

  /** Symmetric shadowcasting visits each affected texel at most once per
   * octant, replacing a Bresenham ray from the source to every flood cell. */
  private castVisibilityOctant(
    width: number,
    height: number,
    centerX: number,
    centerY: number,
    row: number,
    startSlope: number,
    endSlope: number,
    radius: number,
    xx: number,
    xy: number,
    yx: number,
    yy: number,
    occlusion: Uint8Array,
  ): void {
    if (startSlope < endSlope) return;
    let nextStartSlope = startSlope;
    for (let distance = row; distance <= radius; distance += 1) {
      let blocked = false;
      let deltaX = -distance - 1;
      const deltaY = -distance;
      while (deltaX <= 0) {
        deltaX += 1;
        const x = centerX + deltaX * xx + deltaY * xy;
        const y = centerY + deltaX * yx + deltaY * yy;
        const leftSlope = (deltaX - 0.5) / (deltaY + 0.5);
        const rightSlope = (deltaX + 0.5) / (deltaY - 0.5);
        if (startSlope < rightSlope) continue;
        if (endSlope > leftSlope) break;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const index = y * width + x;
        this.visibleEpoch[index] = this.epoch;
        const kind = occlusion[index];
        const opaque = this.isOpaqueBlocker(kind);
        if (blocked) {
          if (opaque) {
            nextStartSlope = rightSlope;
            continue;
          }
          blocked = false;
          startSlope = nextStartSlope;
        } else if (opaque && distance < radius) {
          blocked = true;
          this.castVisibilityOctant(
            width, height, centerX, centerY, distance + 1,
            startSlope, leftSlope, radius, xx, xy, yx, yy, occlusion,
          );
          nextStartSlope = rightSlope;
        }
      }
      if (blocked) break;
    }
  }

  private regionHasOcclusion(
    occlusion: Uint8Array,
    prefix: Uint32Array | null,
    width: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ): boolean {
    if (prefix !== null && prefix.length === (width + 1) * (Math.floor(occlusion.length / width) + 1)) {
      const stride = width + 1;
      const left = minX;
      const top = minY;
      const right = maxX + 1;
      const bottom = maxY + 1;
      const count = (prefix[bottom * stride + right] ?? 0)
        - (prefix[top * stride + right] ?? 0)
        - (prefix[bottom * stride + left] ?? 0)
        + (prefix[top * stride + left] ?? 0);
      return count > 0;
    }
    for (let y = minY; y <= maxY; y += 1) {
      const row = y * width;
      for (let x = minX; x <= maxX; x += 1) if (occlusion[row + x] !== LIGHT_OPEN) return true;
    }
    return false;
  }

  private applyOpen(
    pixels: Uint8ClampedArray,
    haloPixels: Uint8ClampedArray | null,
    width: number,
    centerX: number,
    centerY: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    radiusCost: number,
    initialStrength: number,
    light: FloodLight,
    visibilityRequired = false,
    receiverOwners: Uint16Array | null = null,
    occlusion: Uint8Array | null = null,
    relitReceiverOwners: Uint16Array | null = null,
    casterOwners: Uint16Array | null = null,
  ): void {
    const centerSubtexelX = Math.round(centerX * 16);
    const centerSubtexelY = Math.round(centerY * 16);
    const maximumPathCost = Math.ceil((Math.max(maxX - centerX, centerX - minX) * 2
      + Math.max(maxY - centerY, centerY - minY)) * 16);
    this.prepareOpenPathBands(maximumPathCost, radiusCost * 16, initialStrength);
    for (let y = minY; y <= maxY; y += 1) {
      const dy = Math.abs(y * 16 - centerSubtexelY);
      for (let x = minX; x <= maxX; x += 1) {
        const dx = Math.abs(x * 16 - centerSubtexelX);
        const pathCost = dx > dy ? dx * 2 + dy : dy * 2 + dx;
        let band = this.openPathBands[pathCost] ?? 0;
        if (band === 0) continue;
        const index = y * width + x;
        if (visibilityRequired && this.visibleEpoch[index] !== this.epoch) {
          const receiverOwner = (relitReceiverOwners ?? receiverOwners)?.[index] ?? 0;
          const elevatedReceiverIsVisible = receiverOwner !== 0
            && this.visibleReceiverOwnerEpoch[receiverOwner] === this.epoch
            && this.receiverHasClearLine(
              occlusion, casterOwners, width,
              Math.round(centerX), Math.round(centerY), x, y, receiverOwner,
            );
          const frontFaceReceivesLight = occlusion?.[index] === LIGHT_CLIFF_FACE_BLOCKER
            && centerY > y
            && this.frontFaceHasClearLine(
              occlusion, width, Math.round(centerX), Math.round(centerY), x, y,
            );
          if (!elevatedReceiverIsVisible && !frontFaceReceivesLight) continue;
        }
        if (this.trunkShadowEpoch[index] === this.epoch
          && (receiverOwners?.[index] ?? 0) !== (this.trunkShadowOwner[index] ?? 0)) {
          band = Math.round(band * (1000 - (this.trunkShadowOpacity[index] ?? 0)) / 1000);
          if (band === 0) continue;
        }
        this.writeBand(pixels, haloPixels, index, light, band);
        this.visitedTexels += 1;
      }
    }
  }

  private isOpaqueBlocker(kind: number | undefined): boolean {
    return kind === LIGHT_HARD_BLOCKER
      || kind === LIGHT_SPRITE_BLOCKER
      || kind === LIGHT_CLIFF_FACE_BLOCKER;
  }

  /** A vertical cliff face is one continuous screen-facing receiver. Ignore
   * its own stacked wall rows when checking the source ray, but retain shadows
   * from ordinary terrain and sprite silhouettes. */
  private frontFaceHasClearLine(
    occlusion: Uint8Array,
    width: number,
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number,
  ): boolean {
    let x = sourceX;
    let y = sourceY;
    const dx = Math.abs(targetX - sourceX);
    const dy = Math.abs(targetY - sourceY);
    const stepX = sourceX < targetX ? 1 : -1;
    const stepY = sourceY < targetY ? 1 : -1;
    let error = dx - dy;
    while (x !== targetX || y !== targetY) {
      const doubledError = error * 2;
      if (doubledError > -dy) {
        error -= dy;
        x += stepX;
      }
      if (doubledError < dx) {
        error += dx;
        y += stepY;
      }
      if (x === targetX && y === targetY) return true;
      const kind = occlusion[y * width + x];
      if (kind === LIGHT_HARD_BLOCKER || kind === LIGHT_SPRITE_BLOCKER) return false;
    }
    return true;
  }

  /** Elevated artwork may ignore its own opaque base, but never another
   * owner's silhouette. This keeps the caster lit without promoting every
   * pixel of that owner through a neighbouring object's shadow. */
  private receiverHasClearLine(
    occlusion: Uint8Array | null,
    casterOwners: Uint16Array | null,
    width: number,
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number,
    receiverOwner: number,
  ): boolean {
    if (occlusion === null) return true;
    let x = sourceX;
    let y = sourceY;
    const dx = Math.abs(targetX - sourceX);
    const dy = Math.abs(targetY - sourceY);
    const stepX = sourceX < targetX ? 1 : -1;
    const stepY = sourceY < targetY ? 1 : -1;
    let error = dx - dy;
    while (x !== targetX || y !== targetY) {
      const doubledError = error * 2;
      if (doubledError > -dy) {
        error -= dy;
        x += stepX;
      }
      if (doubledError < dx) {
        error += dx;
        y += stepY;
      }
      if (x === targetX && y === targetY) return true;
      const index = y * width + x;
      const kind = occlusion[index];
      if (kind === LIGHT_SPRITE_BLOCKER && (casterOwners?.[index] ?? 0) === receiverOwner) continue;
      if (this.isOpaqueBlocker(kind)) return false;
    }
    return true;
  }

  private prepareColorBands(light: FloodLight): void {
    for (let band = 1; band <= LIGHT_BANDS; band += 1) {
      this.bandRed[band] = Math.round(light.color.r * band / LIGHT_BANDS);
      this.bandGreen[band] = Math.round(light.color.g * band / LIGHT_BANDS);
      this.bandBlue[band] = Math.round(light.color.b * band / LIGHT_BANDS);
      this.bandLuma[band] = Math.round(
        (light.color.r * 0.2126 + light.color.g * 0.7152 + light.color.b * 0.0722)
        * band / LIGHT_BANDS,
      );
    }
  }

  /** The additive flame core follows the exact fractional emitter position.
   * Thresholding flood bands made individual texels toggle whenever a carried
   * torch crossed the light grid, even while the outer field remained smooth. */
  private stampFlameHalo(
    haloPixels: Uint8ClampedArray | null,
    width: number,
    height: number,
    centerX: number,
    centerY: number,
    light: FloodLight,
    initialStrength: number,
  ): void {
    if (haloPixels === null || light.profile !== 'flame') return;
    const radius = 1.5;
    const peakAlpha = 24 * initialStrength / 1000;
    const minX = Math.max(0, Math.floor(centerX - radius));
    const minY = Math.max(0, Math.floor(centerY - radius));
    const maxX = Math.min(width - 1, Math.ceil(centerX + radius));
    const maxY = Math.min(height - 1, Math.ceil(centerY + radius));
    for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance >= radius) continue;
      const falloff = 1 - distance / radius;
      const alpha = Math.round(peakAlpha * falloff * falloff);
      if (alpha <= 0) continue;
      const offset = (y * width + x) * 4;
      if (alpha <= (haloPixels[offset + 3] ?? 0)) continue;
      haloPixels[offset] = light.color.r;
      haloPixels[offset + 1] = light.color.g;
      haloPixels[offset + 2] = light.color.b;
      haloPixels[offset + 3] = alpha;
    }
  }

  private prepareOpenPathBands(maximumPathCost: number, radiusCost: number, initialStrength: number): void {
    if (this.openPathBands.length <= maximumPathCost) {
      this.openPathBands = new Uint8Array(maximumPathCost + 1);
    }
    for (let pathCost = 0; pathCost <= maximumPathCost; pathCost += 1) {
      const strength = initialStrength - Math.ceil(1000 * pathCost / radiusCost);
      this.openPathBands[pathCost] = strength <= 0 ? 0 : quantizedBand(strength);
    }
  }

  private resize(cellCount: number): void {
    if (this.bestStrength.length === cellCount) return;
    this.bestStrength = new Uint16Array(cellCount);
    this.bestEpoch = new Uint32Array(cellCount);
    this.finalizedEpoch = new Uint32Array(cellCount);
    this.visibleEpoch = new Uint32Array(cellCount);
    this.trunkShadowEpoch = new Uint32Array(cellCount);
    this.trunkShadowOpacity = new Uint16Array(cellCount);
    this.trunkShadowOwner = new Uint16Array(cellCount);
    this.queuedEpoch = new Uint32Array(cellCount);
    this.queuePrevious = new Int32Array(cellCount);
    this.queueNext = new Int32Array(cellCount);
    this.epoch = 0;
  }

  private begin(): void {
    this.epoch = (this.epoch + 1) >>> 0;
    if (this.epoch === 0) {
      this.bestEpoch.fill(0);
      this.finalizedEpoch.fill(0);
      this.queuedEpoch.fill(0);
      this.visibleEpoch.fill(0);
      this.trunkShadowEpoch.fill(0);
      this.visibleReceiverOwnerEpoch.fill(0);
      this.epoch = 1;
    }
    this.bucketHeads.fill(-1);
    this.strongestBucket = 0;
  }

  private offer(index: number, strength: number): void {
    if (this.finalizedEpoch[index] === this.epoch) return;
    if (this.bestEpoch[index] === this.epoch && (this.bestStrength[index] ?? 0) >= strength) return;
    if (this.queuedEpoch[index] === this.epoch) this.removeQueued(index);
    this.bestEpoch[index] = this.epoch;
    this.bestStrength[index] = strength;
    const head = this.bucketHeads[strength] ?? -1;
    this.queuePrevious[index] = -1;
    this.queueNext[index] = head;
    if (head >= 0) this.queuePrevious[head] = index;
    this.bucketHeads[strength] = index;
    this.queuedEpoch[index] = this.epoch;
    this.strongestBucket = Math.max(this.strongestBucket, strength);
  }

  private offerTerminal(
    pixels: Uint8ClampedArray,
    haloPixels: Uint8ClampedArray | null,
    index: number,
    light: FloodLight,
    strength: number,
  ): void {
    if (this.bestEpoch[index] === this.epoch && (this.bestStrength[index] ?? 0) >= strength) return;
    this.bestEpoch[index] = this.epoch;
    this.bestStrength[index] = strength;
    this.writeLight(pixels, haloPixels, index, light, strength);
    this.visitedTexels += 1;
  }

  private pop(): number {
    while (this.strongestBucket > 0 && (this.bucketHeads[this.strongestBucket] ?? -1) < 0) {
      this.strongestBucket -= 1;
    }
    const index = this.bucketHeads[this.strongestBucket] ?? 0;
    const next = this.queueNext[index] ?? -1;
    this.bucketHeads[this.strongestBucket] = next;
    if (next >= 0) this.queuePrevious[next] = -1;
    this.queuedEpoch[index] = 0;
    this.finalizedEpoch[index] = this.epoch;
    while (this.strongestBucket > 0 && (this.bucketHeads[this.strongestBucket] ?? -1) < 0) {
      this.strongestBucket -= 1;
    }
    return index;
  }

  private removeQueued(index: number): void {
    const strength = this.bestStrength[index] ?? 0;
    const previous = this.queuePrevious[index] ?? -1;
    const next = this.queueNext[index] ?? -1;
    if (previous >= 0) this.queueNext[previous] = next;
    else this.bucketHeads[strength] = next;
    if (next >= 0) this.queuePrevious[next] = previous;
    this.queuedEpoch[index] = 0;
  }

  private writeLight(
    pixels: Uint8ClampedArray,
    haloPixels: Uint8ClampedArray | null,
    index: number,
    light: FloodLight,
    strength: number,
  ): void {
    const band = quantizedBand(strength);
    if (band <= 0) return;
    this.writeBand(pixels, haloPixels, index, light, band);
  }

  private writeBand(
    pixels: Uint8ClampedArray,
    _haloPixels: Uint8ClampedArray | null,
    index: number,
    _light: FloodLight,
    band: number,
  ): void {
    const offset = index * 4;
    const red = this.bandRed[band] ?? 0;
    const green = this.bandGreen[band] ?? 0;
    const blue = this.bandBlue[band] ?? 0;
    if (red > pixels[offset]!) pixels[offset] = red;
    if (green > pixels[offset + 1]!) pixels[offset + 1] = green;
    if (blue > pixels[offset + 2]!) pixels[offset + 2] = blue;
    if (this.southFacePixels !== null) {
      const x = index % this.southFaceWidth;
      const y = Math.floor(index / this.southFaceWidth);
      const dx = this.southFaceSourceX - x;
      const dy = this.southFaceSourceY - y;
      const distance = Math.hypot(dx, dy);
      const gate = distance < 0.25 ? 1 : Math.max(0, Math.min(1, (dy / distance + 0.35) / 0.7));
      const luma = Math.round((this.bandLuma[band] ?? 0) * gate);
      if (luma > (this.southFacePixels[index] ?? 0)) this.southFacePixels[index] = luma;
    }
  }

}
