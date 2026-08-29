export type LifecycleDisposer = () => void;

interface RegisteredDisposer {
  readonly label: string;
  readonly dispose: LifecycleDisposer;
  active: boolean;
}

/** Small nested ownership boundary for app- and world-session resources.
 * Children dispose before local resources; disposing a child never affects its
 * parent. Registration may allocate, disposal and hot rendering never do. */
export class LifecycleRegistry {
  private readonly disposers: RegisteredDisposer[] = [];
  private readonly children = new Set<LifecycleRegistry>();
  private disposedValue = false;

  constructor(
    readonly label: string,
    private readonly parent: LifecycleRegistry | null = null,
  ) {}

  get disposed(): boolean { return this.disposedValue; }
  get activeChildCount(): number { return this.children.size; }
  get registeredDisposerCount(): number { return this.disposers.length; }

  child(label: string): LifecycleRegistry {
    this.assertActive();
    const child = new LifecycleRegistry(label, this);
    this.children.add(child);
    return child;
  }

  add(label: string, dispose: LifecycleDisposer): LifecycleDisposer {
    this.assertActive();
    const registration: RegisteredDisposer = { label, dispose, active: true };
    this.disposers.push(registration);
    return () => {
      if (!registration.active) return;
      registration.active = false;
      const index = this.disposers.lastIndexOf(registration);
      if (index >= 0) this.disposers.splice(index, 1);
      dispose();
    };
  }

  ownAbortController(label: string): AbortController {
    const controller = new AbortController();
    this.add(label, () => controller.abort());
    return controller;
  }

  dispose(): void {
    if (this.disposedValue) return;
    this.disposedValue = true;
    const errors: Error[] = [];
    const children = [...this.children];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      try {
        children[index]!.dispose();
      } catch (error: unknown) {
        errors.push(asError(error, `child:${children[index]!.label}`));
      }
    }
    this.children.clear();
    for (let index = this.disposers.length - 1; index >= 0; index -= 1) {
      const registration = this.disposers[index]!;
      if (!registration.active) continue;
      registration.active = false;
      try {
        registration.dispose();
      } catch (error: unknown) {
        errors.push(asError(error, registration.label));
      }
    }
    this.disposers.length = 0;
    this.parent?.children.delete(this);
    if (errors.length > 0) {
      throw new AggregateError(errors, `Failed to dispose lifecycle ${this.label}`);
    }
  }

  private assertActive(): void {
    if (this.disposedValue) throw new Error(`Lifecycle ${this.label} is already disposed`);
  }
}

function asError(error: unknown, label: string): Error {
  if (error instanceof Error) return error;
  return new Error(`Disposer ${label} failed: ${String(error)}`);
}
