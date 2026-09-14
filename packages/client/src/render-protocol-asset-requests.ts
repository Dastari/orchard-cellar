import type { GameplayDiagnosticState } from './gameplay-render-protocol.js';

export interface ProtocolAssetRequest {
  readonly timestamp: number;
  readonly url: string;
  readonly season: string | null;
  readonly variant: 'original' | 'omit';
  readonly effectiveQuality: 'basic' | 'dynamic';
  readonly requestedQuality: 'basic' | 'dynamic';
  readonly effectiveModel: 'classic' | 'unified';
  readonly fallbackReason: string | null;
}

export function atlasRequestIdentity(url: string): Pick<ProtocolAssetRequest, 'season' | 'variant'> | null {
  const filename = url.split(/[?#]/, 1)[0]!.split('/').at(-1) ?? '';
  if (!/^atlas_.+\.png$/.test(filename)) return null;
  return { season: /_(spring|summer|autumn|winter)(?:\.omit)?\.png$/.exec(filename)?.[1] ?? null,
    variant: filename.endsWith('.omit.png') ? 'omit' : 'original' };
}

let installed = false;
/** Both atlas loaders assign Image.src after acquiring a queue slot. Observe
 * that boundary, not load completion or the driver's requested mode. This is
 * opt-in capture instrumentation and leaves no hook installed after disposal. */
export function installProtocolAssetRequests(readState: () => Pick<GameplayDiagnosticState['lighting'], 'effectiveQuality' | 'requestedQuality' | 'model' | 'fallbackReason'>, capacity = 16_384) {
  if (installed) throw new Error('render_protocol_asset_probe_already_installed');
  if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('Invalid asset request capacity');
  const prototype = HTMLImageElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'src');
  if (!descriptor?.set || !descriptor.configurable) throw new Error('render_protocol_asset_probe_unavailable');
  const requests: ProtocolAssetRequest[] = [];
  let overflow = false, active = true;
  Object.defineProperty(prototype, 'src', { ...descriptor, set(this: HTMLImageElement, value: string) {
    const identity = atlasRequestIdentity(value);
    if (identity !== null) {
      if (requests.length === capacity) overflow = true;
      else {
        const state = readState();
        requests.push({ timestamp: performance.now(), url: value, ...identity,
          effectiveQuality: state.effectiveQuality, requestedQuality: state.requestedQuality,
          effectiveModel: state.model, fallbackReason: state.fallbackReason });
      }
    }
    descriptor.set!.call(this, value);
  } });
  installed = true;
  return {
    requests,
    get overflow() { return overflow; },
    dispose() {
      if (!active) return;
      Object.defineProperty(prototype, 'src', descriptor);
      installed = false; active = false;
    },
  };
}
