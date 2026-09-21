import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiTone } from '../tokens.js';
import { uiIcon, type UiIconSource } from './media.js';
import { uiButton } from './button.js';
import { uiTooltip } from './tooltip.js';
export interface UiStatusEffect {
  readonly id: string;
  readonly name: string;
  readonly icon: UiIconSource;
  readonly tone?: UiTone;
  readonly remainingTicks: number;
  readonly durationTicks: number;
  readonly stacks?: number;
}
export interface UiStatusEffectsOptions {
  readonly id?: string;
  readonly effects: readonly UiStatusEffect[];
  readonly ticksPerSecond: number;
  readonly layout?: UiStyle;
}
export function uiStatusEffectLabel(effect: UiStatusEffect, ticksPerSecond: number): string {
  const seconds = Math.ceil(Math.max(0, effect.remainingTicks) / ticksPerSecond);
  return `${effect.name}${(effect.stacks ?? 1) > 1 ? ` x${effect.stacks}` : ''} ${seconds}s`;
}
export function uiStatusEffectBlinkHidden(effect: UiStatusEffect, reducedMotion: boolean): boolean {
  return !reducedMotion && effect.durationTicks > 0 && effect.remainingTicks <= effect.durationTicks / 10
    && Math.floor(effect.remainingTicks / 5) % 2 === 0;
}
/** Retain identity and tooltip timers while authoritative durations change. */
export function uiStatusEffects(options: UiStatusEffectsOptions): UiElement {
  if (!Number.isFinite(options.ticksPerSecond) || options.ticksPerSecond <= 0) throw new Error('Effects require a positive tick rate');
  const retained = new Map<string, { effect: UiStatusEffect; readonly key: string; readonly cell: UiElement; readonly wrapper: UiElement }>();
  return new UiElement({ id: options.id, kind: 'status-effects', props: { effects: options.effects },
    style: { display: 'flex', direction: 'row', gap: 2, width: 'grow', height: 'fit', ...options.layout },
    measure(element) {
      const active = new Set<string>();
      for (const effect of element.props['effects'] as readonly UiStatusEffect[]) {
        active.add(effect.id);
        const key = JSON.stringify([effect.icon, effect.tone]);
        let entry = retained.get(effect.id);
        if (entry?.key !== key) {
          entry?.wrapper.dispose();
          const icon = uiIcon(effect.icon, { tone: effect.tone });
          const face = uiButton({ label: '', tone: effect.tone, layout: { width: uiFixed(24), height: uiFixed(24) } });
          const current = { effect };
          const cell = new UiElement({ ...face.hooks, onPointer: undefined, onKey: undefined, pointerMode: 'passthrough', id: `${element.id}:${effect.id}`, kind: 'status-effect', focusable: true,
            paint(node, context) { if (!uiStatusEffectBlinkHidden(current.effect, context.reducedMotion)) { face.hooks.paint?.(node, context); icon.hooks.paint?.(node, context); } },
          });
          const wrapper = uiTooltip(() => uiStatusEffectLabel(current.effect, options.ticksPerSecond), cell,
            { width: uiFixed(24), height: uiFixed(24), shrink: 0 });
          entry = { get effect() { return current.effect; }, set effect(value) { current.effect = value; }, key, cell, wrapper };
          retained.set(effect.id, entry); element.append(wrapper);
        }
        entry.effect = effect;
        const label = uiStatusEffectLabel(effect, options.ticksPerSecond);
        if (entry.cell.label !== label) { entry.cell.label = label; entry.wrapper.invalidate(); }
      }
      for (const [id, entry] of retained) if (!active.has(id)) { entry.wrapper.dispose(); retained.delete(id); }
      return { min: { width: 0, height: 0 }, preferred: { width: 0, height: 0 } };
    },
  });
}
