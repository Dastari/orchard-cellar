/** Effectively continuous 8-bit falloff after the light-only layer is
 * bilinear composited. The flood itself remains integer and allocation-free. */
export const LIGHT_BANDS = 255;
export const LIGHT_OPEN = 0;
export const LIGHT_HARD_BLOCKER = 1;
export const LIGHT_SOFT_ATTENUATOR = 2;
export const LIGHT_SPRITE_BLOCKER = 3;
/** A tree trunk casts a short ground shadow. It is deliberately not an
 * infinitely-tall shadowcasting wall: the elevated tree sprite has separate
 * receiver ownership so it cannot receive its own projected shadow. */
export const LIGHT_TRUNK_BLOCKER = 4;
export const SOFT_ATTENUATION_PER_MILLE = 550;
export const TRUNK_SHADOW_LENGTH_TEXELS = 8;
const TRUNK_SHADOW_MAX_OPACITY = 700;

export type LightFacing = 'up' | 'right' | 'down' | 'left';
export type LightProfile = 'steady' | 'flame' | 'pulse';

export interface FloodLight {
  readonly centerX: number;
  readonly centerY: number;
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
  private readonly bandRed = new Uint8Array(LIGHT_BANDS + 1);
  private readonly bandGreen = new Uint8Array(LIGHT_BANDS + 1);
  private readonly bandBlue = new Uint8Array(LIGHT_BANDS + 1);
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
  ): void {
    const cellCount = width * height;
    if (cellCount <= 0 || pixels.length < cellCount * 4 || occlusion.length < cellCount) return;
    this.resize(cellCount);
    this.begin();
    this.prepareColorBands(light);
    this.visitedTexels = 0;

    const [offsetX, offsetY] = facingOffset(light.facing);
    const centerX = Math.max(0, Math.min(width - 1, light.centerX + offsetX));
    const centerY = Math.max(0, Math.min(height - 1, light.centerY + offsetY));
    const initialStrength = Math.max(0, Math.min(MAX_LIGHT_STRENGTH, Math.round(light.strengthPerMille ?? 1000)));
    if (initialStrength === 0) return;
    const radiusCost = Math.max(1, Math.round(Math.max(0.25, light.radius) * 2));
    const reach = Math.ceil(light.radius * initialStrength / 1000);
    const minX = Math.max(0, Math.floor(centerX - reach));
    const minY = Math.max(0, Math.floor(centerY - reach));
    const maxX = Math.min(width - 1, Math.ceil(centerX + reach));
    const maxY = Math.min(height - 1, Math.ceil(centerY + reach));
    if (!this.regionHasOcclusion(occlusion, occlusionPrefix, width, minX, minY, maxX, maxY)) {
      this.applyOpen(pixels, haloPixels, width, centerX, centerY, minX, minY, maxX, maxY, radiusCost, initialStrength, light);
      return;
    }

    const lineOfSightOriginX = Math.round(centerX);
    const lineOfSightOriginY = Math.round(centerY);
    const occlusionKinds = this.regionOcclusionKinds(occlusion, width, minX, minY, maxX, maxY);
    const hasDirectionalBlockers = (occlusionKinds
      & ((1 << LIGHT_HARD_BLOCKER) | (1 << LIGHT_SPRITE_BLOCKER))) !== 0;
    const hasSoftAttenuators = (occlusionKinds & (1 << LIGHT_SOFT_ATTENUATOR)) !== 0;
    const hasTrunkBlockers = (occlusionKinds & (1 << LIGHT_TRUNK_BLOCKER)) !== 0;
    if (hasDirectionalBlockers) this.buildVisibility(
      width, height, lineOfSightOriginX, lineOfSightOriginY, reach, occlusion,
    );
    if (hasTrunkBlockers && trunkOwners !== null) this.buildTrunkShadows(
      width, height, centerX, centerY, minX, minY, maxX, maxY,
      occlusion, trunkOwners, trunkCellIndices, trunkCellCount,
    );
    if ((hasDirectionalBlockers || hasTrunkBlockers) && !hasSoftAttenuators) {
      this.applyOpen(
        pixels, haloPixels, width, centerX, centerY,
        minX, minY, maxX, maxY, radiusCost, initialStrength, light,
        hasDirectionalBlockers, hasTrunkBlockers ? receiverOwners : null,
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
        if ((blocker === LIGHT_HARD_BLOCKER || blocker === LIGHT_SPRITE_BLOCKER)
          && hasDirectionalBlockers && this.visibleEpoch[nextIndex] !== this.epoch) continue;
        if (blocker === LIGHT_HARD_BLOCKER || blocker === LIGHT_SPRITE_BLOCKER) {
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
      if (blocker === LIGHT_HARD_BLOCKER || blocker === LIGHT_SPRITE_BLOCKER) {
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

  /** Projects a compact, feathered ground shadow from only the far edge of
   * each trunk footprint. The shadow is bounded so trees add depth without
   * turning an orchard into long black corridors. */
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
        const progress = (step - 1) / TRUNK_SHADOW_LENGTH_TEXELS;
        const opacity = Math.round(TRUNK_SHADOW_MAX_OPACITY * (1 - progress) * (1 - progress));
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
        const opaque = kind === LIGHT_HARD_BLOCKER || kind === LIGHT_SPRITE_BLOCKER;
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
        if (visibilityRequired && this.visibleEpoch[index] !== this.epoch) continue;
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

  private prepareColorBands(light: FloodLight): void {
    for (let band = 1; band <= LIGHT_BANDS; band += 1) {
      this.bandRed[band] = Math.round(light.color.r * band / LIGHT_BANDS);
      this.bandGreen[band] = Math.round(light.color.g * band / LIGHT_BANDS);
      this.bandBlue[band] = Math.round(light.color.b * band / LIGHT_BANDS);
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
    haloPixels: Uint8ClampedArray | null,
    index: number,
    light: FloodLight,
    band: number,
  ): void {
    const offset = index * 4;
    const red = this.bandRed[band] ?? 0;
    const green = this.bandGreen[band] ?? 0;
    const blue = this.bandBlue[band] ?? 0;
    if (red > pixels[offset]!) pixels[offset] = red;
    if (green > pixels[offset + 1]!) pixels[offset + 1] = green;
    if (blue > pixels[offset + 2]!) pixels[offset + 2] = blue;
    if (haloPixels === null || light.profile !== 'flame' || band < Math.round(LIGHT_BANDS * 0.875)) return;
    haloPixels[offset] = light.color.r;
    haloPixels[offset + 1] = light.color.g;
    haloPixels[offset + 2] = light.color.b;
    haloPixels[offset + 3] = Math.max(
      haloPixels[offset + 3] ?? 0,
      Math.round(16 + 16 * band / LIGHT_BANDS),
    );
  }
}
