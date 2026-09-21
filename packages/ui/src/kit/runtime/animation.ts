export interface UiAnimation {
  readonly duration: number; readonly decorative?: boolean;
  readonly update: (progress: number) => void; readonly complete?: () => void;
}
export class UiAnimations {
  private tasks = new Map<string, { animation: UiAnimation; elapsed: number }>();
  private last: number | null = null;
  get active(): boolean { return this.tasks.size > 0; }
  add(id: string, animation: UiAnimation): void {
    if (!Number.isFinite(animation.duration) || animation.duration < 0) throw new Error('Invalid UI animation duration');
    if (!this.tasks.size) this.last = null;
    this.tasks.set(id, { animation, elapsed: 0 });
  }
  cancel(id: string): void { this.tasks.delete(id); }
  tick(now: number, visible = true, reducedMotion = false): boolean {
    const delta = this.last === null ? 0 : Math.max(0, now - this.last); this.last = now;
    if (!visible) return false;
    for (const [id, task] of this.tasks) {
      task.elapsed += delta;
      const progress = reducedMotion && task.animation.decorative ? 1
        : task.animation.duration === 0 ? 1 : Math.min(1, task.elapsed / task.animation.duration);
      task.animation.update(progress);
      if (progress === 1) { this.tasks.delete(id); task.animation.complete?.(); }
    }
    return this.active;
  }
  resetClock(): void { this.last = null; }
  dispose(): void { this.tasks.clear(); this.last = null; }
}
