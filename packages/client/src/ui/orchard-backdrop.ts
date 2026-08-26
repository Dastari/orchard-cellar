/** Shared account/loading backdrop drawn in the game's hard-edged pixel language. */
export function drawOrchardBackdrop(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeMs: number,
): void {
  const pixel = Math.max(1, Math.min(3, Math.floor(Math.min(width / 480, height / 270))));
  const horizon = Math.round(height * 0.44 / pixel) * pixel;
  context.imageSmoothingEnabled = false;
  context.fillStyle = '#83bbcf';
  context.fillRect(0, 0, width, horizon);
  context.fillStyle = '#65954f';
  context.fillRect(0, horizon, width, height - horizon);

  const cloud = (x: number, y: number, size: number): void => {
    const unit = pixel * size;
    context.fillStyle = '#d9edf0';
    context.fillRect(Math.round(x / pixel) * pixel, y, 32 * unit, 7 * unit);
    context.fillRect(Math.round(x / pixel) * pixel + 7 * unit, y - 5 * unit, 12 * unit, 5 * unit);
    context.fillRect(Math.round(x / pixel) * pixel + 18 * unit, y - 3 * unit, 9 * unit, 3 * unit);
    context.fillStyle = '#b8d8df';
    context.fillRect(Math.round(x / pixel) * pixel + 4 * unit, y + 7 * unit, 25 * unit, 2 * unit);
  };
  const wrapCloud = (offset: number, speed: number, cloudWidth: number): number => (
    (offset + timeMs * speed / 1000) % (width + cloudWidth * pixel) - cloudWidth * pixel
  );
  cloud(wrapCloud(width * 0.12, 5, 38), Math.round(horizon * 0.23 / pixel) * pixel, 1);
  cloud(wrapCloud(width * 0.58, 3, 76), Math.round(horizon * 0.52 / pixel) * pixel, 2);
  cloud(wrapCloud(width * 0.88, 4, 38), Math.round(horizon * 0.33 / pixel) * pixel, 1);

  // A stepped, tufted horizon avoids a perfectly straight color split.
  context.fillStyle = '#527b48';
  for (let x = 0, index = 0; x < width; x += 16 * pixel, index += 1) {
    const rise = [2, 5, 3, 7, 2, 4, 6][index % 7]! * pixel;
    context.fillRect(x, horizon - rise, 4 * pixel, rise);
    context.fillRect(x + 4 * pixel, horizon - Math.max(pixel, rise - 2 * pixel), 5 * pixel, Math.max(pixel, rise - 2 * pixel));
  }

  // Sparse deterministic grass marks: small clusters rather than repeated bands.
  for (let row = 0, y = horizon + 17 * pixel; y < height - 12 * pixel; row += 1, y += 29 * pixel) {
    const start = ((row * 43 + 11) % 67) * pixel;
    for (let x = start; x < width; x += 83 * pixel) {
      const variant = (row + Math.round(x / pixel)) % 3;
      context.fillStyle = variant === 0 ? '#4f7d43' : '#79a95d';
      context.fillRect(x, y + 2 * pixel, 2 * pixel, 3 * pixel);
      context.fillRect(x - 2 * pixel, y + 4 * pixel, 2 * pixel, pixel);
      context.fillRect(x + 2 * pixel, y + 3 * pixel, 3 * pixel, pixel);
    }
  }
  context.fillStyle = '#3b673c';
  context.fillRect(0, height - 8 * pixel, width, 8 * pixel);
}
