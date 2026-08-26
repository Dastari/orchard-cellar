import { coinPurseFromBronze } from '@orchard/sim';
import { drawPixelText, measurePixelText, type PixelUi } from '../render/pixel-ui.js';
import type { UiRect } from './geometry.js';
import { drawUiSkinAsset, type UiSkin } from './skin.js';

export type CurrencyDisplaySize = 'small' | 'medium' | 'large';

export interface CurrencyDisplayOptions {
  readonly size?: CurrencyDisplaySize;
  readonly align?: 'left' | 'right';
  readonly color?: string;
  readonly includeZero?: boolean;
}

const METRICS = {
  small: { icon: 8, gap: 1, groupGap: 3, textY: 1, scale: 1 },
  medium: { icon: 12, gap: 2, groupGap: 4, textY: 3, scale: 1 },
  large: { icon: 16, gap: 3, groupGap: 6, textY: 5, scale: 1 },
} as const;

/** Reusable renderer for balances and costs. Values stay in canonical bronze;
 * denomination is presentation-only and can therefore be used anywhere. */
export class CurrencyDisplay {
  constructor(
    private readonly skin: Pick<UiSkin, 'coinGold' | 'coinSilver' | 'coinBronze'>,
    private readonly fonts: PixelUi,
  ) {}

  measure(balanceBronze: bigint, options: CurrencyDisplayOptions = {}): UiRect {
    const size = options.size ?? 'medium';
    const metrics = METRICS[size];
    const groups = this.groups(balanceBronze, options.includeZero ?? true);
    const width = groups.reduce((total, group, index) => total + metrics.icon + metrics.gap
      + measurePixelText(group.value.toString(), metrics.scale, this.fonts.font)
      + (index === groups.length - 1 ? 0 : metrics.groupGap), 0);
    return { x: 0, y: 0, width, height: metrics.icon };
  }

  draw(context: CanvasRenderingContext2D, balanceBronze: bigint, x: number, y: number, options: CurrencyDisplayOptions = {}): UiRect {
    const size = options.size ?? 'medium';
    const metrics = METRICS[size];
    const measured = this.measure(balanceBronze, options);
    const left = options.align === 'right' ? x - measured.width : x;
    let cursor = left;
    const groups = this.groups(balanceBronze, options.includeZero ?? true);
    groups.forEach((group, index) => {
      drawUiSkinAsset(context, group.asset, { x: cursor, y, width: metrics.icon, height: metrics.icon });
      cursor += metrics.icon + metrics.gap;
      const label = group.value.toString();
      drawPixelText(context, this.fonts, label, cursor, y + metrics.textY, {
        color: options.color ?? '#5f3b24', scale: metrics.scale,
      });
      cursor += measurePixelText(label, metrics.scale, this.fonts.font);
      if (index < groups.length - 1) cursor += metrics.groupGap;
    });
    return { x: left, y, width: measured.width, height: measured.height };
  }

  private groups(balanceBronze: bigint, includeZero: boolean) {
    const purse = coinPurseFromBronze(balanceBronze < 0n ? 0n : balanceBronze);
    const all = [
      { value: purse.gold, asset: this.skin.coinGold },
      { value: purse.silver, asset: this.skin.coinSilver },
      { value: purse.bronze, asset: this.skin.coinBronze },
    ];
    if (includeZero) return all;
    const nonzero = all.filter((group) => group.value > 0n);
    return nonzero.length > 0 ? nonzero : [all[2]!];
  }
}
