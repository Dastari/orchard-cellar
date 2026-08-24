const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  A: ['0110', '1001', '1111', '1001', '1001'],
  C: ['0111', '1000', '1000', '1000', '0111'],
  D: ['1110', '1001', '1001', '1001', '1110'],
  E: ['1111', '1000', '1110', '1000', '1111'],
  I: ['111', '010', '010', '010', '111'],
  K: ['1001', '1010', '1100', '1010', '1001'],
  L: ['1000', '1000', '1000', '1000', '1111'],
  M: ['10001', '11011', '10101', '10001', '10001'],
  O: ['0110', '1001', '1001', '1001', '0110'],
  R: ['1110', '1001', '1110', '1010', '1001'],
  S: ['0111', '1000', '0110', '0001', '1110'],
  T: ['11111', '00100', '00100', '00100', '00100'],
  V: ['10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10101', '11011', '10001'],
  Y: ['10001', '01010', '00100', '00100', '00100'],
  ':': ['0', '1', '0', '1', '0'],
  ' ': ['00', '00', '00', '00', '00'],
};

export function drawBitmapText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color = '#f5e5b8',
  scale = 1,
): void {
  context.fillStyle = color;
  let cursor = x;
  for (const character of text.toUpperCase()) {
    const glyph = GLYPHS[character] ?? GLYPHS[' '] ?? [];
    const width = glyph[0]?.length ?? 2;
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < width; column += 1) {
        if (glyph[row]?.[column] === '1') context.fillRect(cursor + column * scale, y + row * scale, scale, scale);
      }
    }
    cursor += (width + 1) * scale;
  }
}
