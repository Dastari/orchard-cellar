export function repeatCost(base: number, owned: number, growth: number): number {
  return Math.ceil(base * growth ** owned);
}

export function treeMilestoneMultiplier(count: number): number {
  if (count >= 25) return 24;
  if (count >= 15) return 8;
  if (count >= 10) return 4;
  if (count >= 5) return 2;
  return 1;
}

export function equipmentMilestoneMultiplier(count: number): number {
  if (count >= 10) return 12;
  if (count >= 6) return 4;
  if (count >= 3) return 2;
  return 1;
}

export function diminishingPowerReward(total: number, divisor: number, exponent: number,
  scale: number, alreadyHeld = 0): number {
  return Math.max(0, Math.floor((total / divisor) ** exponent * scale) - alreadyHeld);
}

export function soften(cap: number, base: number, sum: number): number {
  return cap - (cap - base) * Math.exp(-sum / (cap - base));
}
