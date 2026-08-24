export class Camera {
  x = 0;
  y = 0;

  constructor(
    readonly viewportWidth: number,
    readonly viewportHeight: number,
    readonly worldWidth: number,
    readonly worldHeight: number,
  ) {}

  follow(targetX: number, targetY: number): void {
    this.x = Math.round(Math.max(0, Math.min(targetX - this.viewportWidth / 2, this.worldWidth - this.viewportWidth)));
    this.y = Math.round(Math.max(0, Math.min(targetY - this.viewportHeight / 2, this.worldHeight - this.viewportHeight)));
  }
}

