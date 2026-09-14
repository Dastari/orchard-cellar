import { describe, expect, it, vi } from 'vitest';
import { AtlasVariantCohort, AtlasVariantLoadError } from '@orchard/ui';
import { LightingQualityState } from '@orchard/engine/lighting-quality';
import { GameplayLightingPresentation, renderWithGameplayLightingFallback } from './gameplay-lighting-presentation.js';

function pendingPages() {
  const pages = new AtlasVariantCohort();
  let resolve!: (ready: boolean) => void;
  let ready = false;
  const prepare = vi.spyOn(pages, 'prepare').mockImplementation(() => new Promise((done) => { resolve = done; }));
  const commit = vi.spyOn(pages, 'commit').mockImplementation(() => ready);
  const reset = vi.spyOn(pages, 'reset');
  return { pages, prepare, commit, reset, complete: (value = true) => { ready = value; resolve(value); } };
}

describe('gameplay page transitions', () => {
  it('does not request omit pages in Basic or Classic across 600 frames', () => {
    const input = pendingPages(), presentation = new GameplayLightingPresentation(input.pages);
    const quality = new LightingQualityState('basic');
    for (let frame = 0; frame < 600; frame++) presentation.prepare(quality, 'unified', null);
    quality.request('dynamic');
    for (let frame = 0; frame < 600; frame++) presentation.prepare(quality, 'classic', null);
    expect(input.prepare).not.toHaveBeenCalled(); expect(input.commit).not.toHaveBeenCalled();
    expect(presentation.retainedBytes).toBe(0); expect(quality.effective).toBe('dynamic');
    expect(presentation.model).toBe('classic');
  });
  it('keeps the complete Classic presentation until a frame-boundary Dynamic commit', async () => {
    const input = pendingPages(), presentation = new GameplayLightingPresentation(input.pages);
    const quality = new LightingQualityState('dynamic');
    presentation.prepare(quality, 'classic', null);
    for (let frame = 0; frame < 600; frame++) presentation.prepare(quality, 'unified', null);
    expect(input.prepare).toHaveBeenCalledOnce(); expect(input.commit).not.toHaveBeenCalled();
    expect(presentation.model).toBe('classic'); expect(quality.effective).toBe('dynamic');
    expect(quality.reason).toBe('preparing');
    input.complete(); await Promise.resolve();
    expect(presentation.model).toBe('classic');
    presentation.prepare(quality, 'unified', null);
    expect(presentation.model).toBe('unified'); expect(presentation.modelChanged).toBe(true);
    expect(quality.reason).toBeNull();
    presentation.prepare(quality, 'unified', null);
    expect(presentation.modelChanged).toBe(false); expect(input.prepare).toHaveBeenCalledOnce();
  });
  it('cancels preparation on Basic and ignores a late resolved generation', async () => {
    const input = pendingPages(), presentation = new GameplayLightingPresentation(input.pages);
    const quality = new LightingQualityState('dynamic'); quality.fallback(quality.generation, 'preparing');
    presentation.prepare(quality, 'unified', null);
    quality.request('basic'); presentation.prepare(quality, 'unified', null);
    expect(input.reset).toHaveBeenCalledOnce(); expect(quality.effective).toBe('basic');
    input.complete(); await Promise.resolve();
    presentation.prepare(quality, 'unified', null);
    expect(input.commit).not.toHaveBeenCalled(); expect(presentation.retainedBytes).toBe(0);
    quality.request('dynamic'); presentation.prepare(quality, 'unified', null);
    expect(input.prepare).toHaveBeenCalledTimes(2); expect(quality.effective).toBe('basic');
  });
  it('keeps failed pages on complete Basic and permits an explicit retry', async () => {
    const input = pendingPages(), presentation = new GameplayLightingPresentation(input.pages);
    const quality = new LightingQualityState('dynamic'); quality.fallback(quality.generation, 'preparing');
    presentation.prepare(quality, 'unified', null);
    input.complete(false); await Promise.resolve(); presentation.prepare(quality, 'unified', null);
    expect(quality.effective).toBe('basic'); expect(quality.reason).toBe('atlas_variant_preparation_cancelled');
    expect(input.reset).toHaveBeenCalledOnce(); expect(presentation.retainedBytes).toBe(0);
    presentation.reset(); quality.request('dynamic'); presentation.prepare(quality, 'unified', null);
    expect(input.prepare).toHaveBeenCalledTimes(2);
  });
  it('redraws a complete Basic frame on a page error while preserving unrelated exceptions', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let disabled = false;
    const frame = vi.fn(() => { if (!disabled) throw new AtlasVariantLoadError('page failed'); });
    const fail = vi.fn(() => { disabled = true; });
    renderWithGameplayLightingFallback(0.5, frame, () => disabled, fail);
    expect(frame).toHaveBeenCalledTimes(2); expect(fail).toHaveBeenCalledWith('page failed');
    expect(() => renderWithGameplayLightingFallback(1, () => { throw new Error('unrelated'); }, () => false, fail)).toThrow('unrelated');
    warning.mockRestore();
  });
});
