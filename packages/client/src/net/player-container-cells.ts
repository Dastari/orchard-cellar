import { PLAYER_CONTAINERS, isContainerCellIndex, isPlayerContainerId, type PlayerContainerCellRef, type PlayerContainerId } from '@orchard/sim/container-addressing';
import type { PlayerContainerCell } from '@orchard/world-bindings/types';

/** A `player_container_cell` row whose container the client knows. */
export type PlayerCellRow = PlayerContainerCell & { readonly container: PlayerContainerId };

/**
 * The player's items by container and cell, read-only (Uncapped Storage step 4c). Mirrors the world's
 * `own_player_container_cells` view: all five containers, the stash included, each keyed by its own u32 index, so no
 * container's size can move another container's numbers.
 */
export interface ReadonlyPlayerContainerCells extends Iterable<PlayerCellRow> {
  /** Changes whenever any cell does. */
  readonly revision: number;
  readonly size: number;
  /** The row in one cell; null finds nothing (an unset selection). */
  get(cell: PlayerContainerCellRef | null): PlayerCellRow | undefined;
  /** One container's rows in index order. */
  container(container: PlayerContainerId): readonly PlayerCellRow[];
  /** The carried containers' rows (hotbar, backpack, equipment, crafting), container by container in index order:
   * the stash stays at the hearth. */
  carried(): readonly PlayerCellRow[];
}

const CARRIED: readonly PlayerContainerId[] = PLAYER_CONTAINERS.filter(container => container !== 'stash');

export class PlayerContainerCells implements ReadonlyPlayerContainerCells {
  private readonly cells = new Map<PlayerContainerId, Map<number, PlayerCellRow>>(PLAYER_CONTAINERS.map(container => [container, new Map()]));
  private readonly ordered = new Map<PlayerContainerId, readonly PlayerCellRow[]>();
  private carriedRows: readonly PlayerCellRow[] | null = null;
  private mutationRevision = 0;
  private count = 0;

  get revision(): number { return this.mutationRevision; }
  get size(): number { return this.count; }

  /** Stores a row. A container this client does not know, or an index that is not a u32, is ignored: the client
   * never guesses where such a row belongs. Returns whether the row was stored. */
  set(row: PlayerContainerCell): boolean {
    if (!isPlayerContainerId(row.container) || !isContainerCellIndex(row.index)) return false;
    const cells = this.cells.get(row.container)!;
    if (cells.get(row.index) === row) return true;
    if (!cells.has(row.index)) this.count++;
    cells.set(row.index, row as PlayerCellRow);
    this.changed(row.container);
    return true;
  }

  /** Removes a row. A delete for a cell that already holds another row (a replacement that arrived first) is ignored. */
  delete(row: Pick<PlayerContainerCell, 'id' | 'container' | 'index'>): boolean {
    if (!isPlayerContainerId(row.container)) return false;
    const cells = this.cells.get(row.container)!, current = cells.get(row.index);
    if (current === undefined || current.id !== row.id) return false;
    cells.delete(row.index); this.count--;
    this.changed(row.container);
    return true;
  }

  clear(): void {
    if (this.count === 0) return;
    for (const cells of this.cells.values()) cells.clear();
    this.count = 0; this.ordered.clear(); this.carriedRows = null; this.mutationRevision++;
  }

  get(cell: PlayerContainerCellRef | null): PlayerCellRow | undefined {
    return cell === null ? undefined : this.cells.get(cell.container)?.get(cell.index);
  }

  container(container: PlayerContainerId): readonly PlayerCellRow[] {
    let rows = this.ordered.get(container);
    if (rows === undefined) {
      rows = [...(this.cells.get(container)?.values() ?? [])].sort((left, right) => left.index - right.index);
      this.ordered.set(container, rows);
    }
    return rows;
  }

  carried(): readonly PlayerCellRow[] {
    return this.carriedRows ??= CARRIED.flatMap(container => this.container(container));
  }

  [Symbol.iterator](): Iterator<PlayerCellRow> {
    return PLAYER_CONTAINERS.flatMap(container => this.container(container))[Symbol.iterator]();
  }

  private changed(container: PlayerContainerId): void {
    this.ordered.delete(container);
    if (container !== 'stash') this.carriedRows = null;
    this.mutationRevision++;
  }
}
