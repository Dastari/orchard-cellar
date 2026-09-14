import { FixedStepLoop, type FixedStepLoopObserver, type LoopCallbacks } from './loop.js';
import { PRESENTATION_CAP_EVENT, readPresentationCap, type PresentationCapSetting } from '@orchard/ui';

/** Gameplay construction boundary; simulation and presentation remain in loop. */
export function createGameplayLoop(callbacks: LoopCallbacks, observer: FixedStepLoopObserver): FixedStepLoop {
  const loop = new FixedStepLoop(callbacks, observer);
  const apply = (value: PresentationCapSetting) => loop.setPresentationRate(value === '30hz' ? 30 : 0);
  const changed = (event: Event) => apply((event as CustomEvent<PresentationCapSetting>).detail);
  const storageChanged = () => apply(readPresentationCap());
  apply(readPresentationCap());
  window.addEventListener(PRESENTATION_CAP_EVENT, changed);
  window.addEventListener('storage', storageChanged);
  import.meta.hot?.dispose(() => {
    window.removeEventListener(PRESENTATION_CAP_EVENT, changed);
    window.removeEventListener('storage', storageChanged);
  });
  return loop;
}
