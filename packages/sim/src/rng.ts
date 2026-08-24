export interface RngState {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
}

export interface RngResult {
  readonly state: RngState;
  readonly value: number;
}

function splitMix32(value: number): number {
  let next = (value + 0x9e3779b9) | 0;
  next = Math.imul(next ^ (next >>> 16), 0x21f0aaad);
  next = Math.imul(next ^ (next >>> 15), 0x735a2d97);
  return (next ^ (next >>> 15)) >>> 0;
}

export function createRng(seed: number): RngState {
  const a = splitMix32(seed);
  const b = splitMix32(a);
  const c = splitMix32(b);
  const d = splitMix32(c);
  return { a, b, c, d };
}

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

export function nextRng(state: RngState): RngResult {
  const value = Math.imul(rotateLeft(Math.imul(state.b, 5), 7), 9) >>> 0;
  const temporary = (state.b << 9) >>> 0;
  let c = (state.c ^ state.a) >>> 0;
  let d = (state.d ^ state.b) >>> 0;
  const b = (state.b ^ c) >>> 0;
  const a = (state.a ^ d) >>> 0;
  c = (c ^ temporary) >>> 0;
  d = rotateLeft(d, 11);
  return { state: { a, b, c, d }, value };
}

