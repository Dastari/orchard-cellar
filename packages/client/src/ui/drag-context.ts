export interface DragItemSnapshot {
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability?: number;
}
export interface DragSlotRef { readonly containerId: string; readonly index: number }
export interface MoveItemIntent {
  readonly fromContainer: string;
  readonly fromIndex: number;
  readonly toContainer: string;
  readonly toIndex: number;
  readonly quantity: number;
}

interface DragPayload { readonly source: DragSlotRef; readonly item: DragItemSnapshot; readonly quantity: number }
export type DragState =
  | { readonly phase: 'idle' }
  | ({ readonly phase: 'grabbing' } & DragPayload)
  | ({ readonly phase: 'hovering'; readonly target: DragSlotRef; readonly accepts: boolean } & DragPayload)
  | ({ readonly phase: 'awaiting_commit'; readonly intent: MoveItemIntent } & DragPayload)
  | ({ readonly phase: 'error'; readonly code: string } & DragPayload);

export type DragEvent =
  | { readonly type: 'grab'; readonly source: DragSlotRef; readonly item: DragItemSnapshot; readonly half?: boolean }
  | { readonly type: 'hover'; readonly target: DragSlotRef; readonly accepts: boolean }
  | { readonly type: 'leave' }
  | { readonly type: 'drop' }
  | { readonly type: 'place_one' }
  | { readonly type: 'cancel' }
  | { readonly type: 'commit' }
  | { readonly type: 'error'; readonly code: string };

export interface DragTransition { readonly state: DragState; readonly intent?: MoveItemIntent }

export const IDLE_DRAG: DragState = { phase: 'idle' };

export function reduceDrag(state: DragState, event: DragEvent): DragTransition {
  if (event.type === 'grab') {
    if (!Number.isSafeInteger(event.item.quantity) || event.item.quantity <= 0) return { state };
    return { state: {
      phase: 'grabbing', source: event.source, item: event.item,
      quantity: event.half ? Math.ceil(event.item.quantity / 2) : event.item.quantity,
    } };
  }
  if (event.type === 'cancel' || event.type === 'commit') return { state: IDLE_DRAG };
  if (state.phase === 'idle') return { state };
  if (event.type === 'place_one'
    && (state.phase === 'grabbing' || state.phase === 'hovering' || state.phase === 'error')) {
    if (state.quantity <= 1) return { state: IDLE_DRAG };
    return { state: { ...state, quantity: state.quantity - 1 } };
  }
  if (event.type === 'error') return { state: { phase: 'error', source: state.source, item: state.item, quantity: state.quantity, code: event.code } };
  if (event.type === 'hover' && (state.phase === 'grabbing' || state.phase === 'hovering')) {
    return { state: { phase: 'hovering', source: state.source, item: state.item, quantity: state.quantity, target: event.target, accepts: event.accepts } };
  }
  if (event.type === 'leave' && state.phase === 'hovering') {
    return { state: { phase: 'grabbing', source: state.source, item: state.item, quantity: state.quantity } };
  }
  if (event.type === 'drop' && state.phase === 'hovering' && state.accepts) {
    const intent = {
      fromContainer: state.source.containerId,
      fromIndex: state.source.index,
      toContainer: state.target.containerId,
      toIndex: state.target.index,
      quantity: state.quantity,
    };
    return { state: { phase: 'awaiting_commit', source: state.source, item: state.item, quantity: state.quantity, intent }, intent };
  }
  return { state };
}

export class DragContext {
  state: DragState = IDLE_DRAG;
  dispatch(event: DragEvent): DragTransition {
    const transition = reduceDrag(this.state, event);
    this.state = transition.state;
    return transition;
  }
}
