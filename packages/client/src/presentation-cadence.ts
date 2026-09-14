/** Absolute deadlines keep a 30 Hz cap at 30 Hz on 60/120/144 Hz displays. */
export class PresentationCadence {
  private nextMilliseconds: number | null = null;
  private rate: 0 | 30 = 0;
  set hz(value: 0 | 30) {
    if (this.rate === value) return;
    this.rate = value;
    this.nextMilliseconds = null;
  }
  get hz(): 0 | 30 { return this.rate; }
  reset(milliseconds: number): void {
    this.nextMilliseconds = this.rate === 0 ? null : milliseconds + 1000 / this.rate;
  }
  due(milliseconds: number): boolean {
    if (this.rate === 0) return true;
    if (this.nextMilliseconds === null) { this.reset(milliseconds); return true; }
    // Floating-point timestamps can land a few ulps below an exact deadline.
    if (milliseconds + 0.000001 < this.nextMilliseconds) return false;
    const period = 1000 / this.rate;
    this.nextMilliseconds += (Math.floor(Math.max(0, milliseconds - this.nextMilliseconds) / period) + 1) * period;
    return true;
  }
}
