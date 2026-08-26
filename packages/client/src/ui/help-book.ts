import { drawPixelText, type PixelUi } from '../render/pixel-ui.js';
import { containsPoint, type UiPoint, type UiRect } from './geometry.js';
import { drawUiSkinAsset, type UiSkin } from './skin.js';

const SOURCE_BOOK_WIDTH = 224;
const SOURCE_BOOK_HEIGHT = 133;
const FONT_CELL_WIDTH = 6;
const LINE_HEIGHT = 9;

interface HelpTopic {
  readonly title: string;
  readonly entries: readonly string[];
}

interface HelpLine {
  readonly text: string;
  readonly heading: boolean;
}

export interface HelpBookLayout {
  readonly book: UiRect;
  readonly leftPage: UiRect;
  readonly rightPage: UiRect;
  readonly previousButton: UiRect;
  readonly nextButton: UiRect;
  readonly backButton: UiRect;
}

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    title: 'MOVEMENT',
    entries: [
      'WASD or arrows: move in eight directions.',
      '1-9: select a hotbar slot.',
      '- / +: change world zoom.',
      'Shift - / +: change UI scale.',
    ],
  },
  {
    title: 'ACTIONS',
    entries: [
      'Left click another player or NPC to select it; click empty ground to clear it.',
      'E: ride or dismount a horse, or pick up the faced item.',
      'F: use the selected tool on the faced target.',
      'Q: drop the selected hotbar item.',
      'Space: jump while mounted.',
    ],
  },
  {
    title: 'WINDOWS',
    entries: [
      'I: toggle inventory.',
      'Hold Tab: show online players.',
      'Enter or /: open chat or command input.',
      'Wheel up shows older framed content; drag its scrollbar to browse.',
      'Page Up / Down scroll by a page. Click a scrollbar for arrows and Home / End.',
      'N: toggle nameplates.',
      'Esc: menu, back, or close.',
      'C / V: crafting / barrel prototypes.',
      'F3: network and render metrics.',
      'G: collision and tool-range overlay.',
    ],
  },
  {
    title: 'CHAT AND COMMANDS',
    entries: [
      'Plain messages go to general chat.',
      '/say <message>: a wrapped bubble visible on screen nearby.',
      '/shout or /yell: a bubble with a finite long range and edge direction marker.',
      '/whisper, /tell, or /w <player> <message>: private chat.',
      '/reply or /r <message>: answer your latest incoming whisper.',
      'Tab completes predictions; Up and Down select them.',
      'Owners can use /tp <x> <y> or /tp <player>. Coordinates are tiles.',
    ],
  },
  {
    title: 'SHARED WORLD',
    entries: [
      'Movement, items, NPCs, time, and weather are server authoritative.',
      'Online players share the same island and world clock.',
      'Only the owner can change world time, weather, or wind direction.',
      'Wind direction AUTO chooses a shared compass direction automatically.',
      'Cloud shadows appear in daylight or with rain; directional wind sways trees and grass.',
      'Strong wind carries fading leaves from live tree canopies.',
      'Wildlife lives in habitat packs; distant packs sleep until a farmer approaches.',
      'Livestock and birds settle at night. Bees return to hives that slowly store honey.',
      'Nameplate visibility and zoom are local display settings.',
    ],
  },
  {
    title: 'HORSES',
    entries: [
      'Only one player can ride a horse at a time.',
      'Wild horses are nameless; Nados Mum remains the named island horse.',
      'Mounted movement is twice walking speed.',
      'Tools and item dropping are disabled while mounted.',
      'A jump crosses at most three freshwater or oasis-water tiles.',
      'Horses cannot jump cliffs, ridges, waterfalls, ocean, trees, or unsafe landings.',
    ],
  },
  {
    title: 'ITEMS AND TOOLS',
    entries: [
      'Dropped items keep their actual item type and quantity.',
      'Pickups and inventory moves succeed only when the server validates capacity.',
      'The axe harvests trees. The pickaxe mines reachable ore veins.',
      'Select the hoe, target grass up to 3 tiles away, then click or press F to till it.',
      'Select the watering can and target tilled soil up to 3 tiles away to water it.',
      'Chests use the same tile target. A red frame means terrain, an object, or a player blocks placement.',
      'Neighbouring soil automatically joins into rows, corners, edges, and filled plots.',
      'Rare ore veins are isolated points of interest with large reserves.',
      'Ore drops every third hit. Ordinary rocks break once and drop one stone.',
      'Successful tool uses consume Vigour and one durability; rejected actions and whiffs do not wear tools.',
      'A broken tool stays in its slot. Select a damaged tool and press R to repair it with Wood or Stone.',
      'Durability bars are green, then gold, then red as the tool wears down.',
      'Craft Orchard Tea from an apple and pear; select it and press F to drink it.',
      'Equipment, backpack, and hotbar slots enforce their container rules.',
    ],
  },
  {
    title: 'HELP BOOK',
    entries: [
      'Use Left / Right, Q / E, or the page buttons to turn spreads.',
      'Escape or X returns to the menu.',
      'This book describes implemented controls and rules, not planned features.',
    ],
  },
] as const;

export function helpBookLayout(width: number, height: number): HelpBookLayout {
  const scale = Math.max(0.75, Math.min(2, (width - 8) / SOURCE_BOOK_WIDTH, (height - 8) / SOURCE_BOOK_HEIGHT));
  const book = {
    x: Math.round((width - SOURCE_BOOK_WIDTH * scale) / 2),
    y: Math.round((height - SOURCE_BOOK_HEIGHT * scale) / 2),
    width: Math.round(SOURCE_BOOK_WIDTH * scale),
    height: Math.round(SOURCE_BOOK_HEIGHT * scale),
  };
  const scaled = (value: number): number => Math.round(value * scale);
  return {
    book,
    leftPage: { x: book.x + scaled(15), y: book.y + scaled(11), width: scaled(92), height: scaled(105) },
    rightPage: { x: book.x + scaled(119), y: book.y + scaled(11), width: scaled(91), height: scaled(105) },
    previousButton: { x: book.x + scaled(8), y: book.y + book.height - scaled(20), width: 16, height: 16 },
    nextButton: { x: book.x + book.width - scaled(24), y: book.y + book.height - scaled(20), width: 16, height: 16 },
    backButton: { x: book.x + book.width - scaled(23), y: book.y + scaled(5), width: 16, height: 16 },
  };
}

function wrapText(text: string, maximumCharacters: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (word.length > maximumCharacters) {
      if (line) lines.push(line);
      for (let offset = 0; offset < word.length; offset += maximumCharacters) {
        lines.push(word.slice(offset, offset + maximumCharacters));
      }
      line = '';
      continue;
    }
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maximumCharacters) line = candidate;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

export function paginateHelp(maximumCharacters: number, maximumRows: number): readonly (readonly HelpLine[])[] {
  const pages: HelpLine[][] = [[]];
  const append = (line: HelpLine): void => {
    let page = pages.at(-1)!;
    if (page.length >= maximumRows) {
      page = [];
      pages.push(page);
    }
    page.push(line);
  };
  for (const topic of HELP_TOPICS) {
    const topicLines: HelpLine[] = [
      { text: topic.title, heading: true },
      ...topic.entries.flatMap((entry) => wrapText(`- ${entry}`, maximumCharacters).map((text) => ({ text, heading: false }))),
      { text: '', heading: false },
    ];
    const page = pages.at(-1)!;
    if (page.length > 0 && topicLines.length <= maximumRows && page.length + topicLines.length > maximumRows) pages.push([]);
    for (const line of topicLines) append(line);
  }
  const last = pages.at(-1);
  if (last?.at(-1)?.text === '') last.pop();
  return pages;
}

export class HelpBook {
  private spread = 0;
  private spreadCount = 1;
  private layout = helpBookLayout(480, 270);

  constructor(private readonly skin: UiSkin, private readonly fonts: PixelUi) {}

  reset(): void { this.spread = 0; }

  handleKeyDown(code: string): boolean {
    if (code === 'ArrowLeft' || code === 'PageUp' || code === 'KeyQ') {
      this.spread = Math.max(0, this.spread - 1);
      return true;
    }
    if (code === 'ArrowRight' || code === 'PageDown' || code === 'KeyE') {
      this.spread = Math.min(this.spreadCount - 1, this.spread + 1);
      return true;
    }
    return false;
  }

  pointerDown(point: UiPoint): 'back' | 'page' | null {
    if (containsPoint(this.layout.backButton, point)) return 'back';
    if (containsPoint(this.layout.previousButton, point) && this.spread > 0) {
      this.spread -= 1;
      return 'page';
    }
    if (containsPoint(this.layout.nextButton, point) && this.spread + 1 < this.spreadCount) {
      this.spread += 1;
      return 'page';
    }
    return containsPoint(this.layout.book, point) ? 'page' : null;
  }

  draw(context: CanvasRenderingContext2D, width: number, height: number): void {
    this.layout = helpBookLayout(width, height);
    drawUiSkinAsset(context, this.skin.bookOpen, this.layout.book);
    const maximumCharacters = Math.max(12, Math.floor((Math.min(this.layout.leftPage.width, this.layout.rightPage.width) - 8) / FONT_CELL_WIDTH));
    const maximumRows = Math.max(6, Math.floor((Math.min(this.layout.leftPage.height, this.layout.rightPage.height) - 15) / LINE_HEIGHT));
    const pages = paginateHelp(maximumCharacters, maximumRows);
    this.spreadCount = Math.max(1, Math.ceil(pages.length / 2));
    this.spread = Math.min(this.spread, this.spreadCount - 1);
    this.drawPage(context, this.layout.leftPage, pages[this.spread * 2] ?? []);
    this.drawPage(context, this.layout.rightPage, pages[this.spread * 2 + 1] ?? []);

    drawUiSkinAsset(context, this.skin.buttonDeny, this.layout.backButton, 'idle');
    drawPixelText(context, this.fonts, 'X', this.layout.backButton.x + 8, this.layout.backButton.y + 5, { align: 'center', color: '#fff2d0' });
    if (this.spread > 0) {
      drawUiSkinAsset(context, this.skin.buttonSmall, this.layout.previousButton, 'idle');
      drawPixelText(context, this.fonts, '<', this.layout.previousButton.x + 8, this.layout.previousButton.y + 5, { align: 'center', color: '#5f3b24' });
    }
    if (this.spread + 1 < this.spreadCount) {
      drawUiSkinAsset(context, this.skin.buttonSmall, this.layout.nextButton, 'idle');
      drawPixelText(context, this.fonts, '>', this.layout.nextButton.x + 8, this.layout.nextButton.y + 5, { align: 'center', color: '#5f3b24' });
    }
    drawPixelText(context, this.fonts, `${this.spread * 2 + 1}-${Math.min(pages.length, this.spread * 2 + 2)} / ${pages.length}`,
      this.layout.book.x + this.layout.book.width / 2, this.layout.book.y + this.layout.book.height - 12,
      { align: 'center', color: '#8c5d3a' });
  }

  private drawPage(context: CanvasRenderingContext2D, page: UiRect, lines: readonly HelpLine[]): void {
    lines.forEach((line, index) => drawPixelText(
      context,
      this.fonts,
      line.text,
      line.heading ? page.x + page.width / 2 : page.x + 4,
      page.y + 4 + index * LINE_HEIGHT,
      { align: line.heading ? 'center' : 'left', color: line.heading ? '#4d2e22' : '#6b4428' },
    ));
  }
}
