export const LIGHT_BANDS = 16;
export const LIGHT_OPEN = 0;
export const LIGHT_HARD_BLOCKER = 1;
export const LIGHT_SOFT_ATTENUATOR = 2;
export const SOFT_ATTENUATION_PER_MILLE = 550;

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
  private queuedEpoch = new Uint32Array(0);
  private queuePrevious = new Int32Array(0);
  private queueNext = new Int32Array(0);
  private bucketHeads = new Int32Array(MAX_LIGHT_STRENGTH + 1);
  private openPathBands = new Uint8Array(0);
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
    const seedX = Math.round(centerX);
    const seedY = Math.round(centerY);
    const seed = seedY * width + seedX;
    const initialStrength = Math.max(0, Math.min(MAX_LIGHT_STRENGTH, Math.round(light.strengthPerMille ?? 1000)));
    if (initialStrength === 0) return;
    if (occlusion[seed] === LIGHT_HARD_BLOCKER) {
      this.writeLight(pixels, haloPixels, seed, light, initialStrength);
      this.visitedTexels = 1;
      return;
    }
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

    this.offer(seed, initialStrength);
    while (this.strongestBucket > 0) {
      const index = this.pop();
      const strength = this.bestStrength[index] ?? 0;
      this.writeLight(pixels, haloPixels, index, light, strength);
      this.visitedTexels += 1;
      const x = index % width;
      const y = Math.floor(index / width);
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
        if (blocker === LIGHT_HARD_BLOCKER) {
          this.offerTerminal(pixels, haloPixels, nextIndex, light, nextStrength);
        } else {
          this.offer(nextIndex, nextStrength);
        }
      }
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
  ): void {
    const centerQuarterX = Math.round(centerX * 4);
    const centerQuarterY = Math.round(centerY * 4);
    const maximumPathCost = Math.ceil((Math.max(maxX - centerX, centerX - minX) * 2
      + Math.max(maxY - centerY, centerY - minY)) * 4);
    this.prepareOpenPathBands(maximumPathCost, radiusCost * 4, initialStrength);
    for (let y = minY; y <= maxY; y += 1) {
      const dy = Math.abs(y * 4 - centerQuarterY);
      for (let x = minX; x <= maxX; x += 1) {
        const dx = Math.abs(x * 4 - centerQuarterX);
        const pathCost = dx > dy ? dx * 2 + dy : dy * 2 + dx;
        const band = this.openPathBands[pathCost] ?? 0;
        if (band === 0) continue;
        this.writeBand(pixels, haloPixels, y * width + x, light, band);
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
    if (haloPixels === null || light.profile !== 'flame' || band < LIGHT_BANDS - 1) return;
    haloPixels[offset] = light.color.r;
    haloPixels[offset + 1] = light.color.g;
    haloPixels[offset + 2] = light.color.b;
    haloPixels[offset + 3] = Math.max(haloPixels[offset + 3] ?? 0, band === LIGHT_BANDS ? 32 : 16);
  }
}
