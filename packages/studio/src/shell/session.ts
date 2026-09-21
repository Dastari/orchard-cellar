import { firstAccessibleStudioMode, isStudioRole, type StudioRole } from './access.js';
import type { StudioMode } from '@orchard/ui/studio';

export type StudioEnvironment = 'sandbox' | 'local' | 'production';
export type StudioConnectionPhase = 'anonymous' | 'connecting' | 'connected' | 'error';

export interface StudioSessionSnapshot {
  readonly environment: StudioEnvironment;
  readonly phase: StudioConnectionPhase;
  readonly identity: string | null;
  readonly role: StudioRole | null;
  readonly contentRevision: bigint | null;
  readonly mapRevision: number | null;
  readonly activeMode: StudioMode;
  readonly error: string | null;
}

export class StudioSessionState {
  #snapshot: StudioSessionSnapshot = Object.freeze({
    environment: 'sandbox', phase: 'anonymous', identity: null, role: null,
    contentRevision: null, mapRevision: null, activeMode: 'build', error: null,
  });

  snapshot(): StudioSessionSnapshot { return this.#snapshot; }

  chooseEnvironment(environment: StudioEnvironment): void {
    if (this.#snapshot.phase === 'connected' || this.#snapshot.phase === 'connecting') {
      throw new Error('disconnect_before_environment_change');
    }
    this.#snapshot = Object.freeze({ ...this.#snapshot, environment, error: null });
  }

  beginConnect(): void {
    if (this.#snapshot.environment === 'sandbox') throw new Error('live_environment_required');
    this.#snapshot = Object.freeze({ ...this.#snapshot, phase: 'connecting', error: null });
  }

  connected(input: {
    readonly identity: string;
    readonly role: string;
    readonly contentRevision: bigint | null;
    readonly mapRevision: number | null;
  }): void {
    if (!isStudioRole(input.role)) throw new Error('studio_role_required');
    this.#snapshot = Object.freeze({
      ...this.#snapshot,
      phase: 'connected', identity: input.identity, role: input.role,
      contentRevision: input.contentRevision, mapRevision: input.mapRevision,
      activeMode: firstAccessibleStudioMode(input.role), error: null,
    });
  }

  updateHeads(contentRevision: bigint | null, mapRevision: number | null): void {
    this.#snapshot = Object.freeze({ ...this.#snapshot, contentRevision, mapRevision });
  }

  setMode(activeMode: StudioMode): void {
    this.#snapshot = Object.freeze({ ...this.#snapshot, activeMode });
  }

  failed(error: string): void {
    this.#snapshot = Object.freeze({
      ...this.#snapshot, phase: 'error', identity: null, role: null,
      contentRevision: null, mapRevision: null, activeMode: 'build', error,
    });
  }

  disconnected(): void {
    this.#snapshot = Object.freeze({
      ...this.#snapshot, phase: 'anonymous', identity: null, role: null,
      contentRevision: null, mapRevision: null, activeMode: 'build', error: null,
    });
  }
}
