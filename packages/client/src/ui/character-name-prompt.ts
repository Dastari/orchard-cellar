import { normalizeCharacterName } from '@orchard/sim';
import type { PixelUi } from '../render/pixel-ui.js';
import { drawPixelText } from '../render/pixel-ui.js';
import type { UiPoint, UiRect } from './geometry.js';
import type { UiSkin } from './skin.js';
import { drawUiSkinAsset, drawUiSkinNatural } from './skin.js';
import { drawCanvasTextInput } from './canvas-text-input.js';

export function characterNameErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('display_name_taken')) return 'THAT CHARACTER NAME IS ALREADY TAKEN';
  if (message.includes('invalid_display_name')) return "3-20 LETTERS, NUMBERS, SPACES, - OR '";
  if (message.includes('character_name_already_set')) return 'THIS CHARACTER ALREADY HAS A NAME';
  return 'COULD NOT SAVE THE CHARACTER NAME';
}

function contains(rect: UiRect, point: UiPoint): boolean {
  return point.x >= rect.x && point.x < rect.x + rect.width
    && point.y >= rect.y && point.y < rect.y + rect.height;
}

export class CharacterNamePrompt {
  private activeValue = false;
  private busy = false;
  private error: string | null = null;
  private width = 480;
  private height = 270;
  private panel: UiRect = { x: 100, y: 74, width: 280, height: 122 };
  private inputRect: UiRect = { x: 126, y: 126, width: 228, height: 23 };
  private confirmRect: UiRect = { x: 182, y: 154, width: 116, height: 20 };
  private pointer: UiPoint = { x: -100, y: -100 };
  private touchControls = false;

  constructor(
    private readonly skin: UiSkin,
    private readonly fonts: PixelUi,
    private readonly input: HTMLInputElement,
    private readonly submitName: (name: string) => Promise<void>,
    private readonly onActiveChanged: (active: boolean) => void,
  ) {
    input.maxLength = 20;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Character name');
    input.addEventListener('input', () => { this.error = null; });
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        input.value = '';
        return;
      }
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        this.submit();
      }
    });
    input.addEventListener('keyup', (event) => event.stopPropagation());
  }

  get isActive(): boolean { return this.activeValue; }

  update(width: number, height: number, required: boolean, touchControls = false): void {
    this.width = width;
    this.height = height;
    this.touchControls = touchControls;
    const panelWidth = Math.min(280, width - 20);
    this.panel = {
      x: Math.round((width - panelWidth) / 2),
      y: Math.round((height - 122) / 2),
      width: panelWidth,
      height: 122,
    };
    this.inputRect = { x: this.panel.x + 24, y: this.panel.y + 54, width: this.panel.width - 48, height: 23 };
    this.confirmRect = { x: this.panel.x + Math.round((this.panel.width - 116) / 2), y: this.panel.y + 83, width: 116, height: 20 };
    if (required && !this.activeValue) {
      this.activeValue = true;
      this.busy = false;
      this.error = null;
      this.input.hidden = false;
      this.onActiveChanged(true);
      this.input.focus({ preventScroll: true });
    } else if (!required && this.activeValue) {
      this.activeValue = false;
      this.busy = false;
      this.error = null;
      this.input.value = '';
      this.input.hidden = true;
      this.input.blur();
      this.onActiveChanged(false);
    }
  }

  handleGlobalKeyDown(): boolean {
    if (!this.activeValue) return false;
    if (document.activeElement !== this.input) this.input.focus({ preventScroll: true });
    return true;
  }

  pointerMove(point: UiPoint): void { this.pointer = point; }
  pointerLeave(): void { this.pointer = { x: -100, y: -100 }; }

  pointerDown(point: UiPoint, button: number): boolean {
    if (!this.activeValue) return false;
    this.pointer = point;
    if (button === 0 && (contains(this.inputRect, point) || contains(this.confirmRect, point))) {
      this.input.focus({ preventScroll: true });
      if (contains(this.confirmRect, point)) this.submit();
    }
    return true;
  }

  draw(context: CanvasRenderingContext2D, now = performance.now()): void {
    if (!this.activeValue) return;
    context.fillStyle = '#101813b8';
    context.fillRect(0, 0, this.width, this.height);
    drawUiSkinAsset(context, this.skin.panelWood, this.panel);
    drawUiSkinAsset(context, this.skin.panelParchment, {
      x: this.panel.x + 10,
      y: this.panel.y + 12,
      width: this.panel.width - 20,
      height: this.panel.height - 22,
    });
    drawPixelText(context, this.fonts, 'NAME YOUR CHARACTER', this.panel.x + this.panel.width / 2, this.panel.y + 20, {
      align: 'center', color: '#5f3b24', font: 'header',
    });
    drawPixelText(context, this.fonts, 'THIS IS SEPARATE FROM YOUR LOGIN EMAIL', this.panel.x + this.panel.width / 2, this.panel.y + 40, {
      align: 'center', color: '#8c5d3a',
    });
    drawUiSkinAsset(context, this.skin.frameThin, this.inputRect);
    drawCanvasTextInput(context, this.fonts, this.input, {
      x: this.inputRect.x + 7,
      y: this.inputRect.y + 6,
      width: this.inputRect.width - 14,
      placeholder: '3-20 CHARACTERS',
      now,
    });
    drawUiSkinAsset(context, this.busy ? this.skin.button : this.skin.buttonConfirm, this.confirmRect, this.busy ? 'disabled' : 'idle');
    drawPixelText(context, this.fonts, this.busy ? 'SAVING...' : 'BEGIN', this.confirmRect.x + this.confirmRect.width / 2, this.confirmRect.y + 6, {
      align: 'center', color: '#fff2d0',
    });
    if (this.error !== null) {
      drawPixelText(context, this.fonts, this.error, this.panel.x + this.panel.width / 2, this.panel.y + 108, {
        align: 'center', color: '#a43b2f',
      });
    }
    if (!this.touchControls && this.pointer.x >= 0) {
      drawUiSkinNatural(context, this.skin.cursor, this.pointer.x, this.pointer.y, 'idle');
    }
  }

  private submit(): void {
    if (this.busy) return;
    const name = normalizeCharacterName(this.input.value);
    if (name === null) {
      this.error = "3-20 LETTERS, NUMBERS, SPACES, - OR '";
      return;
    }
    this.busy = true;
    this.error = null;
    void this.submitName(name).catch((error: unknown) => {
      this.busy = false;
      this.error = characterNameErrorText(error);
      this.input.focus({ preventScroll: true });
    });
  }
}
