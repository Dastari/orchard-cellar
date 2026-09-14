import { hearthFurnitureRevision, hearthFurnitureSupportId } from '@orchard/sim';

export interface FurnitureMoveSelection {
  readonly id: bigint; readonly spaceId: number; readonly kind: string;
  readonly tileX: number; readonly tileY: number; readonly stateJson: string;
}
type SendMove = (id: bigint, tileX: number, tileY: number, expectedRevision: bigint, supportId?: bigint) => Promise<void>;

/** Client history requests the same authoritative move reducer in reverse.
 * It never fabricates inventory or mutates subscribed furniture rows. */
export class FurnitureMoveController {
  selected: FurnitureMoveSelection | null = null;
  pending = false;
  private scope = '';
  private generation = 0;
  private operation = 0;
  private inverse: { row: FurnitureMoveSelection; expectedRevision: bigint } | null = null;
  constructor(private readonly send: SendMove) {}
  get canUndo(): boolean { return this.inverse !== null && !this.pending; }
  setScope(scope: string): void {
    if (scope === this.scope) return;
    this.scope = scope; this.generation++; this.operation++; this.pending = false; this.selected = null; this.inverse = null;
  }
  cancel(): void { if (!this.pending) this.selected = null; }
  select(row: FurnitureMoveSelection): void {
    if (this.pending) throw new Error('furniture_action_pending');
    hearthFurnitureRevision(row.stateJson);
    this.selected = { ...row };
  }
  async moveTo(tileX: number, tileY: number, supportId?: bigint): Promise<void> {
    if (this.pending) throw new Error('furniture_action_pending');
    const row = this.selected;
    if (!row) throw new Error('furniture_selection_required');
    const revision = hearthFurnitureRevision(row.stateJson), generation = this.generation;
    const operation = ++this.operation;
    this.pending = true;
    try {
      await this.send(row.id, tileX, tileY, revision, supportId);
      if (generation === this.generation) {
        this.inverse = { row, expectedRevision: revision + 1n };
        this.selected = null;
      }
    } finally { if (operation === this.operation) this.pending = false; }
  }
  async undo(): Promise<void> {
    if (this.pending) throw new Error('furniture_action_pending');
    const inverse = this.inverse;
    if (!inverse) throw new Error('furniture_undo_unavailable');
    const support = hearthFurnitureSupportId(inverse.row.stateJson), generation = this.generation;
    const operation = ++this.operation;
    this.pending = true;
    try {
      await this.send(inverse.row.id, inverse.row.tileX, inverse.row.tileY, inverse.expectedRevision,
        support === undefined ? undefined : BigInt(support));
      if (generation === this.generation) { this.inverse = null; this.selected = null; }
    } finally { if (operation === this.operation) this.pending = false; }
  }
}
