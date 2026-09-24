import { normalizeCharacterName } from '@orchard/sim';
import type { UiKitArt } from './kit/components/art.js';
import { uiCharacterName, type UiCharacterNameElement } from './kit/components/character-name.js';
import { UiRoot } from './kit/runtime/root.js';

export function characterNameErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('display_name_taken')) return 'THAT CHARACTER NAME IS ALREADY TAKEN';
  if (message.includes('invalid_display_name')) return "3-20 LETTERS, NUMBERS, SPACES, - OR '";
  if (message.includes('character_name_already_set')) return 'THIS CHARACTER ALREADY HAS A NAME';
  return 'COULD NOT SAVE THE CHARACTER NAME';
}


/** Production naming authority adapter. The client owns the shared text bridge,
 * event dispatch and canvas transform; this root never binds DOM listeners. */
export class CharacterNamePrompt {
  readonly root: UiRoot;
  private readonly gate: UiCharacterNameElement;
  private activeValue = false;
  private busy = false;
  private error: string | null = null;
  private generation = 0;

  constructor(
    art: UiKitArt,
    private readonly submitName: (name: string) => Promise<void>,
    private readonly onActiveChanged: (active: boolean) => void,
  ) {
    this.root = new UiRoot({ art, scale: 1, label: 'Name your character' });
    this.gate = uiCharacterName({
      onSubmit: name => { void this.submit(name); },
      onChange: () => { if (this.error !== null) { this.error = null; this.refresh(); } },
    });
    this.gate.setStyle({ visible: false });
    this.root.mount(this.gate);
  }

  get isActive(): boolean { return this.activeValue; }

  update(width: number, height: number, required: boolean): void {
    if (this.root.disposed) return;
    this.root.resize(width, height, 1);
    if (required === this.activeValue) return;
    this.generation++;
    this.activeValue = required;
    this.busy = false;
    this.error = null;
    this.gate.setStyle({ visible: required });
    this.refresh();
    if (required) this.gate.focusName();
    else {
      this.gate.editor.setValue('');
      this.root.focus.set(null);
      this.root.input.clearHover();
    }
    this.onActiveChanged(required);
  }

  draw(context: CanvasRenderingContext2D, now = performance.now()): void {
    if (this.activeValue) this.root.drawInContext(context, now);
  }

  dispose(): void {
    this.generation++;
    if (this.activeValue) { this.activeValue = false; this.onActiveChanged(false); }
    this.root.dispose();
  }

  private refresh(): void { this.gate.updateCharacterName({ busy: this.busy, error: this.error }); }

  private async submit(value: string): Promise<void> {
    if (!this.activeValue || this.busy || this.root.disposed) return;
    const name = normalizeCharacterName(value);
    if (name === null) {
      this.error = "3-20 LETTERS, NUMBERS, SPACES, - OR '";
      this.refresh();
      this.gate.focusName();
      return;
    }
    const generation = this.generation;
    this.busy = true;
    this.error = null;
    this.refresh();
    try {
      await this.submitName(name);
      // The authoritative profile update closes the gate. A successful command
      // alone must not reopen BEGIN while that subscription is still catching up.
    } catch (error: unknown) {
      if (generation !== this.generation || !this.activeValue || this.root.disposed) return;
      this.busy = false;
      this.error = characterNameErrorText(error);
      this.refresh();
      this.gate.focusName();
    }
  }
}
