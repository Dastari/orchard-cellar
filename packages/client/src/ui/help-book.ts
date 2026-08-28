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
      'On touch devices, drag the left thumb pad to move.',
      'Hold Shift while moving: sprint at 125% speed; spends Vigour.',
      '1-0: select a hotbar slot (0 is the tenth slot).',
      '- / + or the world mouse wheel: change world zoom.',
      'Shift - / +: change UI scale.',
    ],
  },
  {
    title: 'ACTIONS',
    entries: [
      'Left click another player or NPC to select it; click empty ground to clear it.',
      'E: use the closest available interaction (chest, NPC, horse, portal, or pickup).',
      'F: use the selected tool or item on its highlighted target.',
      'On touch devices, the E and F buttons perform these same actions.',
      'Q: drop the selected hotbar item.',
      'Select a damaged tool and press E while facing an anvil to repair it for 5 copper coins.',
      'Hold left mouse with a bow selected to draw; release to fire toward the pointer.',
      'Space: jump while mounted.',
    ],
  },
  {
    title: 'WINDOWS',
    entries: [
      'I: toggle inventory.',
      'C: toggle crafting.',
      'P: open the Character screen for appearance, equipment, vitals, attributes, and experience.',
      'K: open Skill Trees. Learned ranks persist, but their labelled effects are still previews for now.',
      'L: open the Quest Log. Select a quest to inspect objectives and rewards, track it, or drop it.',
      'Hold Tab: show online players.',
      'Enter or /: open chat or command input.',
      'The speech-bubble button collapses chat; it turns green for unread messages.',
      'Wheel up shows older framed content; drag its scrollbar to browse.',
      'Page Up / Down scroll by a page. Click a scrollbar for arrows and Home / End.',
      'N: toggle nameplates.',
      'Stone-tinted players with a pulsing lightning nameplate are offline and non-interactive.',
      'Z: hide or restore the complete interface.',
      'Esc: menu, back, or close.',
      'The menu includes a full-screen toggle on supported browsers.',
      'F3: player tile coordinates, network, and render metrics.',
      'G: collision and tool-range overlay.',
      'H: hide entity art for a terrain-only debug view.',
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
      '/baltop: show the top 10 player balances privately in your chat console.',
      'Tab completes predictions; Up and Down select them.',
      'Owners can use /tp <x> <y>, /tp <player|NPC>, or /tp <player> <player|NPC>. Coordinates are tiles.',
      'Owners can use /last to show recent login and logout times privately in their chat console.',
    ],
  },
  {
    title: 'DIALOGUE AND TRADE',
    entries: [
      'Press E near an NPC to talk. The NPC stops and faces the latest speaker while dialogue is open.',
      'Use 1-4 to choose a conversation response.',
      'In a shop, 1 selects Buy and 2 selects Sell; choose a row and adjust its quantity before confirming.',
      'On quantity +/- controls, Shift-click changes 10; Control-click jumps to minimum or maximum.',
      'Currency is stored as gold, silver, and bronze in your purse rather than inventory slots.',
      'Marlow buys useful carried goods and sells tools, supplies, and one homestead deed per farmer.',
    ],
  },
  {
    title: 'INVENTORY',
    entries: [
      'Click a stack to hold it, then click a valid slot to place or swap it.',
      'Right click a stack to take half; right click while holding to place one item.',
      'A held stack stays on the cursor after mouse release. Left-drag over slots splits it evenly; right-drag places one in each.',
      'Shift-click quick-moves a stack between available containers.',
      'Double-click collects matching items. Double Shift-click quick-moves every matching stack.',
      'Hover a slot and press 1-0 to swap it with that hotbar slot. Q drops one; Control-Q drops the whole stack.',
      'A backpack expands carried storage. Equipment, backpack, and hotbar slots enforce their item rules.',
      'Open chests and barrels with E. Their storage appears beside your inventory.',
    ],
  },
  {
    title: 'CRAFTING',
    entries: [
      'Press C to open the crafting grid and recipe book.',
      'Click a recipe to fill its ingredients from carried inventory when the grid is clear.',
      'Click the result to carry one craft on the cursor; Shift-click crafts repeatedly while ingredients and storage allow.',
      'Nearby workbenches unlock recipes for chests, barrels, fences, gates, signs, standing torches, and arrows.',
      'Basic recipes include planks, sticks, torches, campfires, workbenches, and Orchard Tea.',
      'Select a crafted placeable, aim at a clear highlighted tile, and press F to place it.',
    ],
  },
  {
    title: 'HOMESTEAD DEEDS',
    entries: [
      'Buy your one homestead deed from Marlow; deeds cannot be dropped or sold.',
      'On the overworld, select the deed, aim at a clear grass site, and press F.',
      'A white footprint is valid; a red footprint means terrain, an object, a player, or another homestead blocks the site.',
      'The deed is consumed only when the homestead is successfully established.',
      'Use the tent entrance to visit the homestead space and its southern gate to return to the overworld.',
      'Visitors share the same homestead space. The owner can open or close its farm gate with F.',
    ],
  },
  {
    title: 'SHARED WORLD',
    entries: [
      'Movement, items, NPCs, time, and weather are server authoritative.',
      'Online players share the same world clock, but only see entities and speech in their current space.',
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
      'Horses can travel between the overworld and a homestead exterior. Dismount before entering tents, interiors, caves, or underground spaces.',
    ],
  },
  {
    title: 'ITEMS AND TOOLS',
    entries: [
      'Dropped items keep their actual item type and quantity.',
      'Pickups and inventory moves succeed only when the server validates capacity.',
      'The axe harvests trees. Chopped trees regrow over one game day; rain helps a little.',
      'The pickaxe mines reachable ore veins.',
      'Select the hoe, target grass up to 3 tiles away, then click or press F to till it.',
      'Select the watering can and target tilled soil up to 3 tiles away to water it.',
      'Chests and crafted placeables use the same tile target. A red frame means placement is blocked.',
      'Neighbouring soil automatically joins into rows, corners, edges, and filled plots.',
      'Rare ore veins are isolated points of interest with large reserves.',
      'Ore drops every third hit. Ordinary rocks break once and drop one stone.',
      'Successful tool uses consume Vigour and one durability; rejected actions and whiffs do not wear tools.',
      'A broken tool stays in its slot. Select it and press E while facing an anvil; 5 copper coins repair it fully.',
      'Durability bars are green, then gold, then red as the tool wears down.',
      'Craft Orchard Tea from an apple and pear; select it and press F to drink it.',
      'Press F to switch a selected lantern, or a nearby dropped lantern. E still picks a dropped lantern up.',
      'Press E at a fence gate to open or close it.',
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
    leftPage: { x: book.x + scaled(15), y: book.y + scaled(11), width: scaled(87), height: scaled(105) },
    rightPage: { x: book.x + scaled(124), y: book.y + scaled(11), width: scaled(86), height: scaled(105) },
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
