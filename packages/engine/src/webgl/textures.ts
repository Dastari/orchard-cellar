import { cleanupWebGL } from './cleanup.js';
import { requireWebGL, WebGLWorldPassError } from './failure.js';
export interface WebGLLightField {
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;
  readonly width: number; readonly height: number; readonly revision: number;
  readonly left: number; readonly top: number; readonly step: number;
}
export interface TextureEntry { texture: WebGLTexture; readonly width: number; readonly height: number; revision: number }
export function imageDimensions(image: CanvasImageSource): { width: number; height: number } {
  if ('naturalWidth' in image) return { width: image.naturalWidth, height: image.naturalHeight };
  if ('videoWidth' in image) return { width: image.videoWidth, height: image.videoHeight };
  if ('displayWidth' in image) return { width: image.displayWidth, height: image.displayHeight };
  return { width: Number(image.width), height: Number(image.height) };
}
/** Retains CPU page identities for restoration; presentation reset releases every reference. */
export class WorldTextures {
  private readonly pages = new Map<CanvasImageSource, TextureEntry>();
  private readonly fields = new Map<Uint8ClampedArray<ArrayBuffer>, TextureEntry>();
  bytes = 0; uploads = 0;
  constructor(private readonly gl: WebGL2RenderingContext, readonly budget = 128 * 1024 * 1024) {}
  get count(): number { return this.pages.size + this.fields.size; }
  page(image: CanvasImageSource, revision = 0, smooth = false): TextureEntry {
    const size = imageDimensions(image);
    let entry = this.pages.get(image);
    if (entry && (entry.width !== size.width || entry.height !== size.height)) {
      this.remove(entry); this.pages.delete(image); entry = undefined;
    }
    if (!entry) { entry = this.create(size.width, size.height); this.pages.set(image, entry); }
    const gl = this.gl; gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    this.filter(smooth);
    if (entry.revision !== revision) {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image as TexImageSource); }
      catch (error) { throw new WebGLWorldPassError('webgl_page_upload_failed', error); }
      this.uploads++; entry.revision = revision; this.check();
    }
    return entry;
  }
  field(field: WebGLLightField): TextureEntry {
    if (field.pixels.length !== field.width * field.height * 4) throw new WebGLWorldPassError('webgl_light_field_size');
    let entry = this.fields.get(field.pixels);
    if (entry && (entry.width !== field.width || entry.height !== field.height)) {
      this.remove(entry); this.fields.delete(field.pixels); entry = undefined;
    }
    if (!entry) {
      // A moving window must not retain an unbounded history of small rasters.
      if (this.fields.size >= 8) { const first = this.fields.keys().next().value!; this.remove(this.fields.get(first)!); this.fields.delete(first); }
      entry = this.create(field.width, field.height); this.fields.set(field.pixels, entry);
    }
    const gl = this.gl; gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, entry.texture); this.filter(true);
    if (entry.revision !== field.revision) {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, field.width, field.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, field.pixels);
      entry.revision = field.revision; this.uploads++; this.check();
    }
    return entry;
  }
  private create(width: number, height: number): TextureEntry {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height * 4 > 4 * 1024 * 1024
      || width > this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) || height > this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE)) throw new WebGLWorldPassError('webgl_texture_size');
    if (this.bytes + width * height * 4 > this.budget) throw new WebGLWorldPassError('webgl_texture_budget');
    const texture = requireWebGL(this.gl.createTexture(), 'webgl_texture_unavailable');
    this.bytes += width * height * 4; return { texture, width, height, revision: Number.NaN };
  }
  private filter(smooth: boolean): void {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, smooth ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, smooth ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  private check(): void { const error = this.gl.getError(); if (error !== this.gl.NO_ERROR) throw new WebGLWorldPassError(`webgl_texture_error:${error}`); }
  private remove(entry: TextureEntry): void { this.gl.deleteTexture(entry.texture); this.bytes -= entry.width * entry.height * 4; }
  invalidate(): void {
    for (const entry of [...this.pages.values(), ...this.fields.values()]) {
      entry.texture = requireWebGL(this.gl.createTexture(), 'webgl_restore_texture_unavailable'); entry.revision = Number.NaN;
    }
  }
  dispose(): void {
    const entries=[...this.pages.values(),...this.fields.values()];this.pages.clear();this.fields.clear();this.bytes=0;
    cleanupWebGL(entries.map(entry=>()=>this.gl.deleteTexture(entry.texture)),'webgl_textures_dispose_failed');
  }
}
