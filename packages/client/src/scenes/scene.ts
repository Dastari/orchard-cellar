export interface Scene {
  update(): void;
  render(context: CanvasRenderingContext2D, alpha: number): void;
}

export class SceneStack {
  private readonly scenes: Scene[] = [];

  push(scene: Scene): void { this.scenes.push(scene); }
  pop(): Scene | undefined { return this.scenes.pop(); }

  update(): void { this.scenes.at(-1)?.update(); }

  render(context: CanvasRenderingContext2D, alpha: number): void {
    for (const scene of this.scenes) scene.render(context, alpha);
  }
}

