export type StudioNotificationKind = 'info' | 'success' | 'warning' | 'error' | 'conflict';

export interface StudioNotification {
  readonly id: number;
  readonly kind: StudioNotificationKind;
  readonly title: string;
  readonly detail: string;
  readonly createdAt: number;
}

export class StudioNotifications {
  #nextId = 1;
  #items: StudioNotification[] = [];

  items(): readonly StudioNotification[] { return Object.freeze([...this.#items]); }

  push(kind: StudioNotificationKind, title: string, detail: string, createdAt = Date.now()): StudioNotification {
    const item = Object.freeze({ id: this.#nextId++, kind, title, detail, createdAt });
    this.#items = [...this.#items, item];
    return item;
  }

  conflict(head: 'map' | 'content', expectedRevision: string, actualRevision: string): StudioNotification {
    return this.push(
      'conflict', `${head === 'map' ? 'Map' : 'Content'} head conflict`,
      `Expected revision ${expectedRevision}; live head is ${actualRevision}. Review the diff before retrying.`,
    );
  }

  dismiss(id: number): void { this.#items = this.#items.filter((item) => item.id !== id); }
}
