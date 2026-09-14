import type { FrameContentDefinition } from '../../content/frame-definition.js';
import { effectsResult } from '../handler.js';
import type { HandlerRegistration } from '../registry.js';

/** Resolve frame commands from active authored bindings. Visibility is client
 * metadata; the effect writer revalidates custody, readiness and authority. */
export function frameActionHandlerRegistrations(
  frames: Iterable<FrameContentDefinition>,
): readonly HandlerRegistration<'frameAction'>[] {
  return Object.freeze([...frames].filter((frame) => frame.retired !== true).flatMap((frame) => (
    (frame.buttons ?? []).flatMap((button): HandlerRegistration<'frameAction'>[] => {
      if (button.onInvoke === undefined) return [];
      const effect = 'claimProcessJob' in button.onInvoke
        ? { claimProcessJob: { action: button.onInvoke.claimProcessJob } } as const
        : { sealContainer: true } as const;
      return [{
        id: `frame.${frame.id}.${button.interaction}`,
        eventType: 'frameAction',
        source: 'global',
        match: { kind: 'any' },
        handler: (event) => event.frameId === frame.id && event.actionId === button.interaction
          ? effectsResult([effect])
          : effectsResult([], { continue: true }),
      }];
    })
  )));
}
