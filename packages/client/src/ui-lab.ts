import {
  ITEM_DEFINITIONS,
  type ContainerSnapshot,
  type ItemStack,
} from '@orchard/sim';
import { dismissLoadingScreen, setLoadingScreenStage } from './loading-screen.js';
import { loadGeneratedAsset, type LoadedAsset } from './render/assets.js';
import {
  drawOutlinedPixelText,
  drawPixelText,
  drawPixelTextInRect,
  loadPixelUi,
} from './render/pixel-ui.js';
import {
  BUTTON_HEIGHT,
  CanvasButton,
  drawButton,
  drawSmallIconButton,
} from './ui/button.js';
import { drawCanvasTextInput } from './ui/canvas-text-input.js';
import { CurrencyDisplay } from './ui/currency-display.js';
import {
  drawUiFrame,
  drawGameBook,
  drawUiFrameControls,
  drawUiFrameResizeHandles,
  layoutGameBook,
  layoutUiFrameSlots,
  parseGameMarkdown,
  UI_FRAME_METRICS,
  UiFrameResizeController,
  uiBookPageRects,
  uiContainerVariant,
  uiFrameContentRect,
  type UiFrameStyle,
  type UiInventorySlotRef,
  UiInventoryInteractionModel,
  drawUiInventorySlot,
  layoutUiFlex,
  layoutUiGrid,
  layoutUiRichText,
  parseUiRichText,
  drawUiRichText,
  uiRichTextLinkAtPoint,
  uiTextLinkLabel,
  type GameBookLayout,
  type GameBookEmbedEntry,
  type GameBookRenderResult,
  type UiTextLinkTarget,
  type UiItemArtwork,
  type UiRichTextLayout,
} from './ui/design-system/index.js';
import { containsPoint, insetRect, type UiPoint, type UiRect } from './ui/geometry.js';
import { drawProgressBar, GREEN_PROGRESS_PALETTE, RED_PROGRESS_PALETTE } from './ui/progress-bar.js';
import { PlayerResourceFrame } from './ui/player-resource-frame.js';
import { Ribbon } from './ui/ribbon.js';
import { ScrollBar } from './ui/scrollbar.js';
import {
  drawUiIconAsset,
  drawUiLabelPlate,
  drawUiSkinAsset,
  drawUiSkinNatural,
  loadUiSkin,
  uiAssetFrame,
  type UiIconName,
} from './ui/skin.js';
import { Slider } from './ui/slider.js';
import {
  drawSpeechBubble,
  speechBubbleLayout,
  type SpeechBubbleDirection,
  type SpeechBubbleKind,
} from './ui/speech-bubble.js';
import { Toggle } from './ui/toggle.js';
import { UI_LAB_COVERAGE } from './ui/ui-lab-catalog.js';

const canvasElement = document.querySelector<HTMLCanvasElement>('#game');
const shellElement = document.querySelector<HTMLElement>('#game-shell');
if (canvasElement === null || shellElement === null) throw new Error('UI lab canvas unavailable');
const canvas: HTMLCanvasElement = canvasElement;
const shell: HTMLElement = shellElement;
const canvasContext = canvas.getContext('2d');
if (canvasContext === null) throw new Error('Canvas 2D unavailable');
const context: CanvasRenderingContext2D = canvasContext;

canvas.classList.add('ui-lab-canvas');
canvas.setAttribute('aria-label', 'Orchard and Cellar public UI component lab. Pan and zoom an infinite specimen canvas.');
shell.classList.add('ui-lab-shell');

setLoadingScreenStage({
  title: 'OPENING THE UI LAB', detail: 'LOADING AUTHORED SKINS AND ITEM ART', progress: 56,
});

const ITEM_ART_KINDS = [
  'wood', 'stone', 'apple', 'grape', 'axe', 'pickaxe', 'torch', 'lantern',
  'ring', 'helm', 'tunic', 'backpack', 'chest', 'orchard_tea',
] as const;

const [fonts, skin, itemArtEntries] = await Promise.all([
  loadPixelUi(),
  loadUiSkin(),
  Promise.all(ITEM_ART_KINDS.map(async (kind) => [
    kind,
    await loadGeneratedAsset(ITEM_DEFINITIONS[kind].iconKey, 'summer'),
  ] as const)),
]);
const itemArtwork: UiItemArtwork = Object.fromEntries(itemArtEntries);

const nativeInput = document.createElement('input');
nativeInput.id = 'ui-lab-text-input';
nativeInput.className = 'canvas-input';
nativeInput.maxLength = 48;
nativeInput.autocomplete = 'off';
nativeInput.setAttribute('aria-label', 'UI lab canvas text field');
nativeInput.placeholder = 'TYPE A FARM NOTE';
shell.append(nativeInput);
nativeInput.addEventListener('focus', () => {
  nativeInput.classList.add('keyboard-active');
  requestUiLabRender();
});
nativeInput.addEventListener('blur', () => {
  nativeInput.classList.remove('keyboard-active');
  requestUiLabRender();
});
nativeInput.addEventListener('input', requestUiLabRender);
nativeInput.addEventListener('select', requestUiLabRender);

const liveStatus = document.createElement('output');
liveStatus.className = 'loading-status';
liveStatus.setAttribute('aria-live', 'polite');
liveStatus.setAttribute('aria-label', 'UI lab interaction status');
shell.append(liveStatus);

const WORLD_BOUNDS: UiRect = { x: 0, y: 0, width: 2520, height: 2580 };
const SECTIONS = {
  foundations: { x: 60, y: 100, width: 720, height: 430 },
  frames: { x: 820, y: 100, width: 880, height: 650 },
  controls: { x: 1740, y: 100, width: 720, height: 650 },
  inventory: { x: 60, y: 570, width: 720, height: 650 },
  feedback: { x: 820, y: 790, width: 880, height: 570 },
  patterns: { x: 1740, y: 790, width: 720, height: 570 },
  books: { x: 60, y: 1400, width: 2400, height: 650 },
  assets: { x: 60, y: 2090, width: 2400, height: 430 },
} as const;

let cssWidth = 1;
let cssHeight = 1;
let dpr = 1;
let camera = { x: 880, y: 430 };
let zoom = 0.8;
let cameraInitialized = false;
let pointerScreen: UiPoint = { x: 0, y: 0 };
let pointerWorld: UiPoint = { x: 0, y: 0 };
let hoveredInventorySlot: UiInventorySlotRef | null = null;
let interactionStatus = 'READY — PAN EMPTY SPACE, WHEEL TO ZOOM, OR TRY A SPECIMEN';
let pressedSpace = false;
let selectedTab = 0;
let selectedResponsiveStyle: UiFrameStyle = 'wood_parchment';
let responsiveBookSpread = 0;
let markdownBookSpread = 0;
let richTextLayout: UiRichTextLayout | null = null;
let inputRect: UiRect = { x: 0, y: 0, width: 0, height: 0 };
let sliderRect: UiRect = { x: 0, y: 0, width: 0, height: 0 };
let scrollRect: UiRect = { x: 0, y: 0, width: 0, height: 0 };
let renderRequest: number | null = null;

function requestUiLabRender(): void {
  if (renderRequest !== null) return;
  renderRequest = requestAnimationFrame(() => {
    renderRequest = null;
    render();
  });
}

function notify(message: string): void {
  interactionStatus = message;
  liveStatus.value = message;
  requestUiLabRender();
}

function initialInventory(): Readonly<Record<string, ContainerSnapshot>> {
  return {
    backpack: {
      id: 'backpack', capacity: 12,
      slots: [
        { itemKind: 'wood', quantity: 40 },
        { itemKind: 'apple', quantity: 12 },
        { itemKind: 'axe', quantity: 1, durability: 54 },
        { itemKind: 'ring', quantity: 1 },
        { itemKind: 'helm', quantity: 1 },
        { itemKind: 'torch', quantity: 8 },
        { itemKind: 'stone', quantity: 99 },
        { itemKind: 'lantern', quantity: 1, lit: false },
        { itemKind: 'grape', quantity: 23 },
        null,
        { itemKind: 'wood', quantity: 80 },
        { itemKind: 'tunic', quantity: 1 },
      ],
    },
    chest: {
      id: 'chest', capacity: 8,
      slots: [
        { itemKind: 'wood', quantity: 90 },
        { itemKind: 'apple', quantity: 30 },
        null, null,
        { itemKind: 'stone', quantity: 20 },
        null, null, null,
      ],
    },
    equipment: {
      id: 'equipment', capacity: 4,
      slots: [null, null, null, null],
      restrictions: {
        0: { requiredTags: ['gear.head'] },
        1: { requiredTags: ['gear.hand'] },
        2: { requiredTags: ['gear.ring'] },
        3: { requiredTags: ['gear.body'] },
      },
    },
  };
}

let inventory = new UiInventoryInteractionModel(initialInventory(), null, {
  backpack: ['chest', 'equipment'],
  chest: ['backpack'],
  equipment: ['backpack'],
});

const slider = new Slider({
  id: 'ui-lab-slider', skin, value: 0.62,
  onChange: (value) => notify(`SLIDER ${(value * 100).toFixed(0)}%`),
});
const toggleOn = new Toggle({
  id: 'ui-lab-toggle-on', skin, fonts, value: true,
  onChange: (value) => notify(`TOGGLE ${value ? 'ON' : 'OFF'}`),
});
const toggleOff = new Toggle({
  id: 'ui-lab-toggle-off', skin, fonts, value: false,
  onChange: (value) => notify(`SECONDARY TOGGLE ${value ? 'ON' : 'OFF'}`),
});
const scrollBar = new ScrollBar(skin);
scrollBar.setMetrics(24, 6);
scrollBar.scrollBy(7);
const currency = new CurrencyDisplay(skin, fonts);
const sectionRibbon = new Ribbon(skin.banner, fonts);
const windowRibbon = new Ribbon(skin.ribbon, fonts);
const fixtureResourceFrame = new PlayerResourceFrame(skin, {
  resolve: () => ({
    health: 78, maxHealth: 100,
    mana: 46, maxMana: 100,
    vigour: 91, maxVigour: 100,
  }),
  drawHead: (target, _playerId, rect) => {
    target.fillStyle = '#f5d494';
    target.fillRect(rect.x, rect.y, rect.width, rect.height);
    target.fillStyle = '#9d6843';
    target.fillRect(rect.x, rect.y, rect.width, Math.max(2, Math.round(rect.height * 0.34)));
    target.fillStyle = '#3f2832';
    const eyeSize = Math.max(1, Math.round(rect.width / 12));
    const eyeY = Math.round(rect.y + rect.height * 0.55);
    target.fillRect(Math.round(rect.x + rect.width * 0.28), eyeY, eyeSize, eyeSize);
    target.fillRect(Math.round(rect.x + rect.width * 0.66), eyeY, eyeSize, eyeSize);
  },
});
const resizeController = new UiFrameResizeController();
let responsiveFrame: UiRect = { x: 858, y: 498, width: 804, height: 218 };
const responsiveResizeBounds: UiRect = { x: 842, y: 472, width: 836, height: 258 };
const responsiveFrameMemory: Partial<Record<UiFrameStyle, UiRect>> = {};

const RESPONSIVE_BOOK_MARKDOWN = [
  '<!-- bookmark: title | Title | gold | left | live-title -->',
  '# Live Book {#live-title}',
  '',
  'Resize this book to reflow **bitmap text** without crossing the spine.',
  '',
  'Open [page two](page:second-page) or inspect [item:apple].',
  '',
  '<!-- page -->',
  '# Second Page {#second-page}',
  '',
  'Navigation and page numbers remain mounted outside writable content.',
].join('\n');
const responsiveBookDocument = parseGameMarkdown(RESPONSIVE_BOOK_MARKDOWN);

const GAME_BOOK_MARKDOWN = [
  '<!-- bookmark: welcome | Welcome | gold | left | orchard-almanac -->',
  '# Orchard Almanac {#orchard-almanac}',
  '',
  'This book is authored as **Markdown** and flowed using bitmap glyph metrics. Text never enters the spine or page-number footer.',
  '',
  'Bring [twelve apples](item:apple) to [Mira](player:farmer-mira) at [Orchard 42, 18](coord:orchard,42,18).',
  '',
  '## Common Markdown',
  '',
  '- Headings and paragraphs',
  '- **Strong**, *emphasis*, and `code`',
  '- Lists, quotes, rules, fenced code, and safe HTTP links',
  '',
  '> Every destination remains typed renderer data.',
  '',
  '<!-- bookmark: recipes | Recipes | green | right | recipes -->',
  '# Recipes {#recipes}',
  '',
  '<!-- embed: item | orchard_tea | Orchard Tea -->',
  '',
  'Embeds are renderer extension points. Games can supply item cards, player cards, coordinates, diagrams, or other approved widgets.',
  '',
  '1. Gather leaves and spring water.',
  '2. Heat the kettle.',
  '3. Share with [Mira](player:farmer-mira).',
  '',
  '<!-- page: 5 -->',
  '<!-- bookmark: cellar | Cellar | blue | left | cellar-map -->',
  '# Cellar Map {#cellar-map}',
  '',
  'This heading is deliberately placed on page five.',
  '',
  '<!-- embed: chart | cellar-flow | Cellar Flow Diagram -->',
  '',
  'Return to the [almanac cover](page:orchard-almanac).',
  '',
  '```txt',
  'HARVEST -> PRESS -> BARREL -> CELLAR',
  '```',
  '',
  '<!-- bookmark: sharing | Sharing | purple | right -->',
  '# Sharing',
  '',
  'Typed links can become inspectable, clickable, and shareable game references without allowing arbitrary script execution.',
].join('\n');
const gameBookDocument = parseGameMarkdown(GAME_BOOK_MARKDOWN);
const gameBookFrame: UiRect = { x: 198, y: 1482, width: 840, height: 499 };
const gameBookLayout: GameBookLayout = layoutGameBook(fonts, gameBookDocument, gameBookFrame, { textScale: 2 });

const liveButtons = [
  new CanvasButton({
    id: 'lab-button-neutral', skin, fonts, label: 'INSPECT',
    onPress: () => notify('NEUTRAL BUTTON PRESSED'),
  }),
  new CanvasButton({
    id: 'lab-button-success', skin, fonts, label: 'CONFIRM', tone: 'success',
    onPress: () => notify('SUCCESS BUTTON PRESSED'),
  }),
  new CanvasButton({
    id: 'lab-button-danger', skin, fonts, label: 'DELETE', tone: 'danger',
    onPress: () => notify('DANGER BUTTON PRESSED'),
  }),
];

interface InventorySlotRegion {
  readonly ref: UiInventorySlotRef;
  readonly rect: UiRect;
}

interface WorldHit {
  readonly rect: UiRect;
  readonly onDown: (point: UiPoint, event: PointerEvent) => void;
}

let worldHits: WorldHit[] = [];
let inventorySlotRegions: InventorySlotRegion[] = [];

type ActiveInteraction =
  | { readonly kind: 'pan'; readonly pointer: UiPoint; readonly camera: UiPoint }
  | { readonly kind: 'resize' }
  | { readonly kind: 'slider' }
  | { readonly kind: 'scrollbar' }
  | { readonly kind: 'inventory' };

let activeInteraction: ActiveInteraction | null = null;

function addHit(rect: UiRect, onDown: WorldHit['onDown']): void {
  worldHits.push({ rect, onDown });
}

function activateBookTarget(
  layout: GameBookLayout,
  target: UiTextLinkTarget,
  setSpread: (spreadIndex: number) => void,
): void {
  if (target.kind === 'page') {
    const pageIndex = layout.anchorPages.get(target.anchor);
    if (pageIndex !== undefined) {
      const spreadIndex = pageIndex === 0 ? 0 : Math.floor((pageIndex + 1) / 2);
      setSpread(spreadIndex);
      notify(`BOOK LINK ${target.anchor.toUpperCase()} — PAGE ${pageIndex + 1}`);
      return;
    }
    notify(`BOOK LINK TARGET MISSING — ${target.anchor.toUpperCase()}`);
    return;
  }
  notify(`BOOK LINK ${uiTextLinkLabel(target)}`);
}

function registerBookInteractions(
  layout: GameBookLayout,
  result: GameBookRenderResult,
  setSpread: (spreadIndex: number) => void,
  name: string,
): void {
  addHit(result.controls.close, () => notify(`${name} CLOSE CONTROL — SAME ACTION, STYLE-AWARE MOUNT`));
  if (result.spreadIndex > 0) {
    if (result.controls.firstPage !== undefined) addHit(result.controls.firstPage, () => {
      setSpread(0);
      notify(`${name} FIRST SPREAD`);
    });
    if (result.controls.previousPage !== undefined) addHit(result.controls.previousPage, () => {
      setSpread(result.spreadIndex - 1);
      notify(`${name} PREVIOUS SPREAD`);
    });
  }
  if (result.spreadIndex < result.spreadCount - 1) {
    if (result.controls.nextPage !== undefined) addHit(result.controls.nextPage, () => {
      setSpread(result.spreadIndex + 1);
      notify(`${name} NEXT SPREAD`);
    });
    if (result.controls.lastPage !== undefined) addHit(result.controls.lastPage, () => {
      setSpread(result.spreadCount - 1);
      notify(`${name} LAST SPREAD`);
    });
  }
  for (const hit of result.links) {
    addHit(hit.rect, () => activateBookTarget(layout, hit.target, setSpread));
  }
  for (const hit of result.bookmarks) {
    addHit(hit.rect, () => {
      setSpread(hit.bookmark.spreadIndex);
      notify(`${name} BOOKMARK ${hit.bookmark.label.toUpperCase()} — PAGE ${hit.bookmark.pageIndex + 1}`);
    });
  }
}

function label(
  value: string,
  x: number,
  y: number,
  options: {
    readonly color?: string;
    readonly header?: boolean;
    readonly align?: CanvasTextAlign;
    readonly scale?: number;
    readonly outline?: boolean;
    readonly outlineColor?: string;
  } = {},
): void {
  const draw = options.outline ? drawOutlinedPixelText : drawPixelText;
  draw(context, fonts, value, x, y, {
    color: options.color ?? '#51351f',
    font: options.header ? 'header' : 'body',
    align: options.align,
    scale: options.scale ?? 1,
    ...(options.outline ? { outlineColor: options.outlineColor ?? '#f8ead0' } : {}),
  });
}

function drawCheckerboard(): void {
  const size = 18;
  context.fillStyle = '#202925';
  context.fillRect(0, 0, cssWidth, cssHeight);
  const offsetX = ((-camera.x * zoom + cssWidth / 2) % (size * 2) + size * 2) % (size * 2);
  const offsetY = ((-camera.y * zoom + cssHeight / 2) % (size * 2) + size * 2) % (size * 2);
  for (let y = offsetY - size * 2; y < cssHeight + size; y += size) {
    const row = Math.round((y - offsetY) / size);
    for (let x = offsetX - size * 2; x < cssWidth + size; x += size) {
      const column = Math.round((x - offsetX) / size);
      context.fillStyle = (row + column) % 2 === 0 ? '#2b3732' : '#34413b';
      context.fillRect(Math.round(x), Math.round(y), size, size);
    }
  }
}

function drawWorldGrid(): void {
  context.save();
  context.lineWidth = 1 / zoom;
  for (let x = 0; x <= WORLD_BOUNDS.width; x += 100) {
    context.strokeStyle = x % 500 === 0 ? '#89a08b33' : '#89a08b18';
    context.beginPath();
    context.moveTo(x + 0.5 / zoom, 0);
    context.lineTo(x + 0.5 / zoom, WORLD_BOUNDS.height);
    context.stroke();
  }
  for (let y = 0; y <= WORLD_BOUNDS.height; y += 100) {
    context.strokeStyle = y % 500 === 0 ? '#89a08b33' : '#89a08b18';
    context.beginPath();
    context.moveTo(0, y + 0.5 / zoom);
    context.lineTo(WORLD_BOUNDS.width, y + 0.5 / zoom);
    context.stroke();
  }
  context.restore();
}

function drawSection(rect: UiRect, title: string, subtitle: string): UiRect {
  drawUiFrame(context, skin, rect, 'wood_parchment');
  sectionRibbon.draw(context, title, rect.x + rect.width / 2, rect.y - 8, {
    maxWidth: rect.width - 36,
    overflow: 'ellipsis',
  });
  const content = uiFrameContentRect(rect, 'wood_parchment', 8);
  drawPixelTextInRect(context, fonts, subtitle, {
    x: content.x,
    y: content.y,
    width: content.width,
    height: 10,
  }, { color: '#8b5a3c', overflow: 'ellipsis' });
  return { ...content, y: content.y + 18, height: Math.max(0, content.height - 18) };
}

function debugContent(rect: UiRect, caption: string): void {
  context.save();
  context.setLineDash([4, 3]);
  context.strokeStyle = '#2d6f98';
  context.fillStyle = '#4aa4cc18';
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
  context.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.width - 1), Math.max(0, rect.height - 1));
  context.restore();
  drawPixelTextInRect(context, fonts, caption, {
    x: rect.x + 4,
    y: rect.y + 4,
    width: Math.max(0, rect.width - 8),
    height: 9,
  }, { color: '#2d6f98', overflow: 'ellipsis' });
}

function drawFoundations(): void {
  const content = drawSection(
    SECTIONS.foundations,
    'FOUNDATIONS & TEXT',
    'BITMAP TYPE / ALIGNMENT / WRAPPING / TYPED LINKS / NATIVE-BACKED INPUT',
  );
  label('HEADER 8×12 — UI HIERARCHY', content.x, content.y, { header: true, color: '#4d2e22' });
  label('BODY 5×7 — Dense labels, descriptions, quantities, and status.', content.x, content.y + 22);
  label('OUTLINED TEXT STAYS LEGIBLE OVER WORLD ART', content.x, content.y + 38, {
    color: '#3f2832', outline: true,
  });

  const aligned = { x: content.x, y: content.y + 60, width: content.width, height: 38 };
  drawUiFrame(context, skin, aligned, 'thin');
  const alignedContent = uiFrameContentRect(aligned, 'thin', 2);
  label('LEFT', alignedContent.x, alignedContent.y + 4, { color: '#6b4428' });
  label('CENTER', alignedContent.x + alignedContent.width / 2, alignedContent.y + 4, {
    align: 'center', color: '#6b4428',
  });
  label('RIGHT', alignedContent.x + alignedContent.width, alignedContent.y + 4, {
    align: 'right', color: '#6b4428',
  });

  const richBounds = { x: content.x, y: content.y + 110, width: content.width, height: 92 };
  drawUiFrame(context, skin, richBounds, 'parchment');
  const richContent = uiFrameContentRect(richBounds, 'parchment', 2);
  richTextLayout = layoutUiRichText(fonts, parseUiRichText(
    'Bring [[item:apple|12 apples]] to [[player:farmer-mira|Mira]] near '
      + '[[coord:orchard,42,18|Orchard 42, 18]]. Links wrap, clip, underline, and retain typed targets.',
  ), richContent, { lineHeight: 11, maxLines: 5, color: '#51351f', linkColor: '#216b91' });
  drawUiRichText(context, fonts, richTextLayout);
  addHit(richBounds, (point) => {
    if (richTextLayout === null) return;
    const target = uiRichTextLinkAtPoint(richTextLayout, point);
    notify(target === null ? 'RICH TEXT PLATE' : `LINK ${uiTextLinkLabel(target)}`);
  });

  inputRect = { x: content.x, y: content.y + 216, width: content.width, height: 34 };
  drawUiFrame(context, skin, inputRect, 'thin');
  drawCanvasTextInput(context, fonts, nativeInput, {
    x: inputRect.x + 10,
    y: inputRect.y + 12,
    width: inputRect.width - 20,
    prefix: 'NOTE: ',
    placeholder: 'TYPE A FARM NOTE',
    color: '#3f2d25',
    placeholderColor: '#986846',
  });
  addHit(inputRect, () => {
    nativeInput.hidden = false;
    nativeInput.focus({ preventScroll: true });
    notify('CANVAS TEXT INPUT FOCUSED — CLIPBOARD, SELECTION, IME, HOME/END ENABLED');
  });

  const wrapping = { x: content.x, y: content.y + 264, width: content.width, height: 74 };
  drawUiFrame(context, skin, wrapping, 'thin');
  const wrapContent = uiFrameContentRect(wrapping, 'thin', 3);
  const wrapLayout = layoutUiRichText(fonts, [{
    text: 'Text layout owns line breaks and ellipsis. This intentionally long specimen is limited to three lines so it can never trespass into the next frame.',
  }], wrapContent, { lineHeight: 10, maxLines: 3, align: 'center' });
  drawUiRichText(context, fonts, wrapLayout);
  label('CENTERED / 3 LINES / CLIPPED', wrapping.x + wrapping.width / 2, wrapping.y + wrapping.height - 14, {
    align: 'center', color: '#8b5a3c',
  });
}

function selectResponsiveFrameStyle(style: UiFrameStyle): void {
  if (style === selectedResponsiveStyle) {
    notify(`${style.toUpperCase()} FRAME ALREADY SELECTED`);
    return;
  }
  responsiveFrameMemory[selectedResponsiveStyle] = responsiveFrame;
  selectedResponsiveStyle = style;
  responsiveFrame = responsiveFrameMemory[style] ?? (style === 'book'
    ? { x: 1050, y: 480, width: 420, height: 249 }
    : { x: 858, y: 498, width: 804, height: 218 });
  responsiveBookSpread = 0;
  notify(`${style.toUpperCase()} FRAME SELECTED — DRAG A CORNER TO TEST ITS REFLOW`);
}

function frameSpecimen(frame: UiRect, style: UiFrameStyle, name: string): void {
  drawUiFrame(context, skin, frame, style);
  if (style === 'book') {
    const [left, right] = uiBookPageRects(frame);
    debugContent(left, 'LEFT PAGE');
    debugContent(right, 'RIGHT PAGE');
  } else debugContent(uiFrameContentRect(frame, style), 'SAFE');
  addHit(frame, () => selectResponsiveFrameStyle(style));
  const controls = drawUiFrameControls(context, skin, fonts, frame, style, {
    bookNavigation: style === 'book', spreadIndex: 0, spreadCount: style === 'book' ? 3 : 1,
  });
  addHit(controls.close, () => notify(`${style.toUpperCase()} CLOSE CONTROL`));
  if (style === 'book' && controls.nextPage !== undefined) {
    addHit(controls.nextPage, () => notify('BOOK NEXT-PAGE MOUNT'));
  }
  if (style === 'book' && controls.lastPage !== undefined) {
    addHit(controls.lastPage, () => notify('BOOK LAST-PAGE MOUNT'));
  }
  if (selectedResponsiveStyle === style) {
    context.save();
    context.setLineDash([5, 3]);
    context.strokeStyle = '#63c74d';
    context.lineWidth = 2;
    context.strokeRect(frame.x - 3, frame.y - 3, frame.width + 6, frame.height + 6);
    context.restore();
  }
  drawPixelTextInRect(context, fonts, name, {
    x: frame.x,
    y: frame.y + frame.height + (style === 'book' ? 24 : 3),
    width: frame.width,
    height: 9,
  }, { align: 'center', color: '#6b4428', overflow: 'ellipsis' });
}

function drawFrames(): void {
  const content = drawSection(
    SECTIONS.frames,
    'FRAMES, SLOTS & RESPONSIVE FLOW',
    'AUTHORED SAFE AREAS / NAMED SLOTS / FLEX + GRID / CONTAINER VARIANTS / LIVE RESIZE',
  );
  const top = content.y;
  frameSpecimen({ x: content.x, y: top, width: 176, height: 102 }, 'wood', 'WOOD 10PX');
  frameSpecimen({ x: content.x + 190, y: top, width: 176, height: 102 }, 'parchment', 'PARCHMENT 8PX');
  frameSpecimen({ x: content.x + 380, y: top, width: 176, height: 102 }, 'thin', 'THIN 6/6/6/7');
  frameSpecimen({ x: content.x + 570, y: top, width: 230, height: 102 }, 'wood_parchment', 'COMPOSITE 18PX');

  const book = { x: content.x, y: top + 120, width: 224, height: 133 };
  frameSpecimen(book, 'book', 'OPEN BOOK / PAGED');

  const slottedFrame = { x: content.x + 246, y: top + 120, width: 300, height: 148 };
  drawUiFrame(context, skin, slottedFrame, 'parchment');
  const slots = layoutUiFrameSlots(slottedFrame, 'parchment', [
    { id: 'header', minSize: { width: 40, height: 18 } },
    { id: 'body', minSize: { width: 40, height: 32 }, grow: 1 },
    { id: 'footer', minSize: { width: 40, height: BUTTON_HEIGHT.regular } },
  ], { gap: 5 });
  const slotColors = { header: '#2d6f9833', body: '#63c74d2a', footer: '#d9a4412a' } as const;
  for (const [id, rect] of Object.entries(slots.slots)) {
    context.fillStyle = slotColors[id as keyof typeof slotColors];
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
    context.strokeStyle = '#6f533a';
    context.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
    drawPixelTextInRect(context, fonts, id.toUpperCase(), {
      x: rect.x + 5,
      y: rect.y + 4,
      width: Math.max(0, rect.width - (id === 'footer' ? 103 : 10)),
      height: 10,
    }, { color: '#51351f', overflow: 'ellipsis' });
  }
  const footer = slots.slots.footer!;
  drawButton(context, skin, fonts, { x: footer.x + footer.width - 88, y: footer.y, width: 88, height: footer.height }, {
    label: 'APPLY', tone: 'success',
  });
  drawPixelTextInRect(context, fonts, 'NAMED CONTENT SLOTS', {
    x: slottedFrame.x,
    y: slottedFrame.y + slottedFrame.height + 3,
    width: slottedFrame.width,
    height: 9,
  }, { align: 'center', color: '#6b4428', overflow: 'ellipsis' });

  const flowFrame = { x: content.x + 566, y: top + 120, width: 234, height: 148 };
  drawUiFrame(context, skin, flowFrame, 'thin');
  const flowContent = uiFrameContentRect(flowFrame, 'thin', 5);
  const flexRects = layoutUiFlex({ ...flowContent, height: 40 }, [
    { minSize: { width: 30, height: 22 }, grow: 1 },
    { minSize: { width: 42, height: 30 }, grow: 2 },
    { minSize: { width: 24, height: 16 }, grow: 1 },
  ], { gap: 5, align: 'center' });
  flexRects.forEach((rect, index) => {
    context.fillStyle = ['#4aa4cc', '#63c74d', '#e3a84b'][index]!;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  });
  const grid = layoutUiGrid({ ...flowContent, y: flowContent.y + 52, height: 65 }, Array.from({ length: 7 }, () => ({
    width: 22, height: 16,
  })), { columns: 'auto', minColumnWidth: 46, columnGap: 4, rowGap: 4, rowHeight: 22, justifyItems: 'center', alignItems: 'center' });
  grid.items.forEach((rect, index) => {
    context.fillStyle = index % 2 === 0 ? '#9d6843' : '#8d5aa7';
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  });
  drawPixelTextInRect(context, fonts, `FLEX + AUTO GRID (${grid.columns} COL)`, {
    x: flowFrame.x,
    y: flowFrame.y + flowFrame.height + 3,
    width: flowFrame.width,
    height: 9,
  }, { align: 'center', color: '#6b4428', overflow: 'ellipsis' });

  if (selectedResponsiveStyle === 'book') {
    const responsiveLayout = layoutGameBook(fonts, responsiveBookDocument, responsiveFrame);
    const bookResult = drawGameBook(context, skin, fonts, responsiveLayout, responsiveBookSpread);
    registerBookInteractions(responsiveLayout, bookResult, (spreadIndex) => {
      responsiveBookSpread = spreadIndex;
    }, 'LIVE BOOK');
    drawUiFrameResizeHandles(context, responsiveFrame, resizeController.active);
    drawPixelTextInRect(context, fonts,
      `LIVE BOOK  ${Math.round(responsiveFrame.width)}×${Math.round(responsiveFrame.height)}  ${responsiveLayout.pageCount} PAGES`, {
        x: responsiveResizeBounds.x,
        y: responsiveResizeBounds.y - 14,
        width: responsiveResizeBounds.width,
        height: 10,
      }, { align: 'center', color: '#8b5a3c', overflow: 'ellipsis' });
    return;
  }

  drawUiFrame(context, skin, responsiveFrame, selectedResponsiveStyle);
  const responsiveContent = uiFrameContentRect(responsiveFrame, selectedResponsiveStyle, 5);
  const variant = uiContainerVariant(responsiveContent.width);
  drawPixelTextInRect(
    context,
    fonts,
    `LIVE ${selectedResponsiveStyle.toUpperCase()}: ${variant.toUpperCase()}  ${Math.round(responsiveFrame.width)}×${Math.round(responsiveFrame.height)}`,
    { x: responsiveContent.x, y: responsiveContent.y, width: responsiveContent.width, height: 14 },
    { font: 'header', color: '#4d2e22', overflow: 'ellipsis' },
  );
  const headerOffset = variant === 'compact' ? 18 : 24;
  const showResizeHint = variant !== 'compact' && responsiveContent.height >= 90;
  const resizeHintHeight = showResizeHint ? 16 : 0;
  const responseBounds = {
    x: responsiveContent.x,
    y: responsiveContent.y + headerOffset,
    width: responsiveContent.width,
    height: Math.max(28, responsiveContent.height - headerOffset - resizeHintHeight),
  };
  const responseItems = [
    { minSize: { width: 76, height: BUTTON_HEIGHT.regular }, grow: 1 },
    { minSize: { width: 106, height: BUTTON_HEIGHT.regular }, grow: 1 },
    { minSize: { width: 132, height: BUTTON_HEIGHT.regular }, grow: 1 },
  ];
  const responseRects = layoutUiFlex(responseBounds, responseItems, {
    direction: variant === 'compact' ? 'column' : 'row',
    gap: 6,
    align: variant === 'compact' ? 'stretch' : 'center',
    justify: variant === 'wide' ? 'space_between' : 'start',
  });
  ['OK', 'RESPONSIVE LABEL', 'A VERY LONG ACTION LABEL'].forEach((text, index) => drawButton(
    context,
    skin,
    fonts,
    responseRects[index]!,
    { label: text, tone: index === 0 ? 'success' : index === 2 ? 'danger' : 'neutral' },
  ));
  const controls = drawUiFrameControls(context, skin, fonts, responsiveFrame, selectedResponsiveStyle);
  addHit(controls.close, () => notify(`LIVE ${selectedResponsiveStyle.toUpperCase()} CLOSE CONTROL`));
  drawUiFrameResizeHandles(context, responsiveFrame, resizeController.active);
  if (showResizeHint) drawPixelTextInRect(context, fonts, 'DRAG ANY CORNER — CONTENT QUERIES ITSELF', {
    x: responsiveContent.x,
    y: responsiveContent.y + responsiveContent.height - 11,
    width: responsiveContent.width,
    height: 9,
  }, { align: 'center', color: '#8b5a3c', overflow: 'ellipsis' });
}

function iconButton(name: UiIconName, rect: UiRect, tooltip: string): void {
  drawSmallIconButton(context, skin, rect, { icon: skin.icons[name] });
  addHit(rect, () => notify(`ICON BUTTON ${tooltip.toUpperCase()}`));
}

function drawControls(): void {
  const content = drawSection(
    SECTIONS.controls,
    'CONTROLS & INDICATORS',
    'BUTTON MATRIX / TABS / ICONS / SLIDER / TOGGLE / SCROLL / PROGRESS / CURRENCY',
  );
  const tones = ['neutral', 'success', 'danger'] as const;
  const states = ['idle', 'pressed', 'disabled'] as const;
  tones.forEach((tone, column) => {
    label(tone.toUpperCase(), content.x + 82 + column * 170, content.y, { align: 'center', color: '#6b4428' });
    states.forEach((state, row) => drawButton(context, skin, fonts, {
      x: content.x + column * 170,
      y: content.y + 18 + row * 30,
      width: 164,
      height: BUTTON_HEIGHT.regular,
    }, { label: state.toUpperCase(), tone, state }));
  });
  label('COMPACT', content.x + 530, content.y, { color: '#6b4428' });
  drawButton(context, skin, fonts, {
    x: content.x + 530, y: content.y + 18, width: 116, height: BUTTON_HEIGHT.compact,
  }, { label: 'SMALL', size: 'compact' });
  drawButton(context, skin, fonts, {
    x: content.x + 530, y: content.y + 44, width: 116, height: BUTTON_HEIGHT.regular,
  }, { label: 'A LABEL THAT FITS' });
  drawButton(context, skin, fonts, {
    x: content.x + 530, y: content.y + 74, width: 68, height: BUTTON_HEIGHT.regular,
  }, { label: 'TRUNCATION EXAMPLE' });

  liveButtons.forEach((button, index) => {
    button.setBounds({
      x: content.x + index * 150,
      y: content.y + 120,
      width: 142,
      height: BUTTON_HEIGHT.regular,
    });
    button.draw(context);
    addHit(button.node.bounds, (point, event) => {
      button.node.onPointer?.({ kind: 'pointer_down', point, button: event.button }, button.node);
    });
  });
  label('LIVE PRESS FEEDBACK', content.x + 462, content.y + 126, { color: '#8b5a3c' });

  const tabY = content.y + 162;
  ['PACK', 'SKILLS', 'QUESTS'].forEach((tab, index) => {
    const rect = { x: content.x + index * 126, y: tabY, width: 120, height: BUTTON_HEIGHT.regular };
    drawButton(context, skin, fonts, rect, { label: tab, tone: selectedTab === index ? 'success' : 'neutral' });
    addHit(rect, () => { selectedTab = index; notify(`TAB ${tab}`); });
  });
  iconButton('save', { x: content.x + 408, y: tabY - 5, width: 32, height: 32 }, 'save');
  iconButton('undo', { x: content.x + 448, y: tabY - 5, width: 32, height: 32 }, 'undo');
  iconButton('redo', { x: content.x + 488, y: tabY - 5, width: 32, height: 32 }, 'redo');
  drawUiSkinAsset(context, skin.buttonSmallConfirm, { x: content.x + 540, y: tabY - 5, width: 32, height: 32 }, 'idle');
  label('✓', content.x + 556, tabY + 5, { align: 'center', color: '#fff2d0' });
  drawUiSkinAsset(context, skin.buttonSmall, { x: content.x + 580, y: tabY - 5, width: 32, height: 32 }, 'disabled');

  sliderRect = { x: content.x, y: content.y + 218, width: 280, height: 16 };
  slider.setBounds(sliderRect);
  slider.draw(context);
  label(`SLIDER ${(slider.value * 100).toFixed(0)}%`, sliderRect.x + sliderRect.width + 12, sliderRect.y + 3, { color: '#6b4428' });
  addHit(sliderRect, (point, event) => {
    if (slider.node.onPointer?.({ kind: 'pointer_down', point, button: event.button }, slider.node)) {
      activeInteraction = { kind: 'slider' };
    }
  });

  const toggleOnRect = { x: content.x, y: content.y + 252, width: 72, height: BUTTON_HEIGHT.regular };
  const toggleOffRect = { x: content.x + 82, y: content.y + 252, width: 72, height: BUTTON_HEIGHT.regular };
  const toggleDisabledRect = { x: content.x + 164, y: content.y + 252, width: 88, height: BUTTON_HEIGHT.regular };
  toggleOn.setBounds(toggleOnRect); toggleOn.draw(context);
  toggleOff.setBounds(toggleOffRect); toggleOff.draw(context);
  drawButton(context, skin, fonts, toggleDisabledRect, { label: 'DISABLED', state: 'disabled' });
  addHit(toggleOnRect, (point, event) => toggleOn.node.onPointer?.({ kind: 'pointer_down', point, button: event.button }, toggleOn.node));
  addHit(toggleOffRect, (point, event) => toggleOff.node.onPointer?.({ kind: 'pointer_down', point, button: event.button }, toggleOff.node));

  scrollRect = { x: content.x + 310, y: content.y + 218, width: 18, height: 88 };
  scrollBar.setBounds(scrollRect);
  scrollBar.draw(context);
  addHit(scrollRect, (point) => {
    if (scrollBar.pointerDown(point)) activeInteraction = { kind: 'scrollbar' };
  });
  label(`SCROLL ${scrollBar.position}/${scrollBar.maximum}`, scrollRect.x + 28, scrollRect.y + 38, { color: '#6b4428' });

  const meterX = content.x;
  const meterY = content.y + 326;
  [0, 0.25, 0.62, 1].forEach((value, index) => drawProgressBar(context, {
    x: meterX, y: meterY + index * 22, width: 230, height: 12,
  }, value, index === 1 ? RED_PROGRESS_PALETTE : GREEN_PROGRESS_PALETTE));
  label('0%', meterX + 242, meterY + 2);
  label('25% DANGER', meterX + 242, meterY + 24, { color: '#a43b2f' });
  label('62%', meterX + 242, meterY + 46);
  label('100%', meterX + 242, meterY + 68);

  label('CURRENCY SIZES', content.x + 390, meterY, { color: '#6b4428' });
  currency.draw(context, 12_345n, content.x + 390, meterY + 18, { size: 'small' });
  currency.draw(context, 12_345n, content.x + 390, meterY + 42, { size: 'medium' });
  currency.draw(context, 12_345n, content.x + 390, meterY + 72, { size: 'large', includeZero: false });

  const authoredY = content.y + 432;
  label('AUTHORED RESOURCE FILLS', content.x, authoredY, { color: '#6b4428' });
  const resourceX = content.x;
  const resourceY = authoredY + 18;
  fixtureResourceFrame.draw(context, 'ui-lab-player', resourceX, resourceY, false, 4);
  label('HEALTH 78%', resourceX + 208, resourceY + 17);
  label('MANA 46%', resourceX + 208, resourceY + 33);
  label('VIGOUR 91%', resourceX + 208, resourceY + 49);
  const xpTrack = { x: resourceX + 350, y: resourceY + 28, width: 230, height: 10 };
  label('XP 64%', xpTrack.x, resourceY + 9, { color: '#6b4428' });
  context.fillStyle = '#181425';
  context.fillRect(xpTrack.x, xpTrack.y, xpTrack.width, xpTrack.height);
  drawUiSkinAsset(context, skin.barGold, {
    x: xpTrack.x + 2,
    y: xpTrack.y + 3,
    width: Math.round((xpTrack.width - 4) * 0.64),
    height: 4,
  });
}

function sameSlot(left: UiInventorySlotRef | null, right: UiInventorySlotRef): boolean {
  return left?.container === right.container && left.index === right.index;
}

function drawInventoryGroup(
  containerId: string,
  title: string,
  origin: UiPoint,
  columns: number,
  rows: number,
  placeholders: readonly string[] = [],
): void {
  label(title, origin.x, origin.y - 18, { header: true, color: '#4d2e22' });
  for (let index = 0; index < columns * rows; index += 1) {
    const rect = {
      x: origin.x + index % columns * 32,
      y: origin.y + Math.floor(index / columns) * 35,
      width: 28,
      height: 31,
    };
    const ref = { container: containerId, index };
    const hovered = sameSlot(hoveredInventorySlot, ref);
    // Quick-craft quantities are already visible through inventory.stack's
    // authoritative preview. Only the slot under the pointer receives a
    // reticle; previously every accumulated drag target obscured its item.
    const accepted = hovered && inventory.cursor !== null && inventory.canAccept(ref);
    const denied = hovered && inventory.cursor !== null && !inventory.canAccept(ref);
    drawUiInventorySlot(context, fonts, skin, itemArtwork, rect, inventory.stack(ref), {
      hovered,
      accepted,
      denied,
      equipmentPlaceholder: placeholders[index],
      hotkey: containerId === 'backpack' && index < 9 ? String(index + 1) : undefined,
    });
    inventorySlotRegions.push({ ref, rect });
    addHit(rect, (_point, event) => {
      const action = inventory.pointerDown(ref, event.button, {
        shift: event.shiftKey,
        double: event.detail >= 2,
      });
      notify(action.status);
      if (inventory.dragging) activeInteraction = { kind: 'inventory' };
    });
  }
}

function drawInventory(): void {
  const content = drawSection(
    SECTIONS.inventory,
    'INVENTORY & SLOT AUTHORITY',
    'LIVE CURSOR STACK / RESTRICTIONS / MAX STACKS / METADATA / QUICK CRAFT / SHIFT + DOUBLE CLICK',
  );
  const instruction = layoutUiRichText(fonts, [{
    text: 'Left: pick/place all   Right: split/place one   Left/right drag: distribute   Shift: quick move   Double: collect matching',
  }], { x: content.x, y: content.y, width: content.width, height: 36 }, { lineHeight: 10, maxLines: 2, color: '#6b4428' });
  drawUiRichText(context, fonts, instruction);

  const storageFrame = { x: content.x, y: content.y + 42, width: content.width, height: 300 };
  drawUiFrame(context, skin, storageFrame, 'parchment');
  drawInventoryGroup('backpack', 'BACKPACK 4×3', { x: storageFrame.x + 28, y: storageFrame.y + 48 }, 4, 3);
  drawInventoryGroup('chest', 'CHEST 4×2', { x: storageFrame.x + 210, y: storageFrame.y + 48 }, 4, 2);
  drawInventoryGroup('equipment', 'EQUIPMENT RULES', { x: storageFrame.x + 400, y: storageFrame.y + 48 }, 2, 2,
    ['head', 'main_hand', 'ring', 'body']);

  const ruleX = storageFrame.x + 400;
  label('HEAD', ruleX, storageFrame.y + 132, { color: '#8b5a3c' });
  label('HAND', ruleX + 32, storageFrame.y + 132, { color: '#8b5a3c' });
  label('RING', ruleX, storageFrame.y + 167, { color: '#8b5a3c' });
  label('BODY', ruleX + 32, storageFrame.y + 167, { color: '#8b5a3c' });

  drawUiLabelPlate(context, skin, {
    x: storageFrame.x + 24, y: storageFrame.y + 218, width: storageFrame.width - 48, height: 26,
  });
  label(inventory.status, storageFrame.x + storageFrame.width / 2, storageFrame.y + 226, {
    align: 'center', color: inventory.status.includes('REJECT') ? '#a43b2f' : '#5f3b24',
  });
  const cursorLabel = inventory.cursor === null
    ? 'CURSOR: EMPTY'
    : `CURSOR: ${inventory.cursor.itemKind.toUpperCase()} ×${inventory.cursor.quantity}`;
  label(cursorLabel, storageFrame.x + 24, storageFrame.y + 258, { header: true, color: '#4d2e22' });
  if (inventory.dragging) label(`PREVIEW: ${inventory.dragMode?.toUpperCase()} / ${inventory.dragTargets.length} TARGETS`,
    storageFrame.x + storageFrame.width - 24, storageFrame.y + 260, { align: 'right', color: '#2d6f98' });

  const ruleFrame = { x: content.x, y: content.y + 358, width: content.width, height: 160 };
  drawUiFrame(context, skin, ruleFrame, 'thin');
  const ruleContent = uiFrameContentRect(ruleFrame, 'thin', 7);
  label('SHARED RULES ACTIVE IN THIS SANDBOX', ruleContent.x, ruleContent.y, { header: true, color: '#4d2e22' });
  const rules = [
    '• 99 MAX RESOURCE STACK / 32 FRUIT / 16 TORCH / 1 TOOL',
    '• DURABILITY + LANTERN POWER ARE STACK IDENTITY METADATA',
    '• COMPATIBLE STACKS MERGE BEFORE EMPTY CELLS',
    '• INVALID EQUIPMENT DROPS LEAVE THE CURSOR UNCHANGED',
    '• PREVIEW AND COMMIT BOTH CALL @ORCHARD/SIM AUTHORITY',
  ];
  rules.forEach((rule, index) => label(rule, ruleContent.x, ruleContent.y + 22 + index * 17, {
    color: index === 4 ? '#2d6f98' : '#6b4428',
  }));
  const resetRect = { x: ruleContent.x + ruleContent.width - 126, y: ruleContent.y + ruleContent.height - 28, width: 126, height: 22 };
  drawButton(context, skin, fonts, resetRect, { label: 'RESET SANDBOX', tone: 'danger' });
  addHit(resetRect, () => {
    inventory = new UiInventoryInteractionModel(initialInventory(), null, {
      backpack: ['chest', 'equipment'], chest: ['backpack'], equipment: ['backpack'],
    });
    notify('INVENTORY SANDBOX RESET');
  });
}

function drawFeedback(): void {
  const content = drawSection(
    SECTIONS.feedback,
    'FEEDBACK, HUD & WORLD ANCHORS',
    'SPEECH CHANNELS / TAIL DIRECTIONS / TOASTS / TOOLTIP / RIBBONS / CURSORS / HUD PLATES',
  );
  const bubbles: readonly [SpeechBubbleKind, SpeechBubbleDirection, string][] = [
    ['say', 'down', 'Hello orchard!'],
    ['shout', 'up', 'Watch out!'],
    ['tell', 'left', 'A private note'],
    ['guild', 'right', 'Guild harvest'],
    ['thought', 'down', 'Maybe tomorrow...'],
    ['reserved', 'up', 'Attention'],
    ['other', 'down', 'System message'],
  ];
  bubbles.forEach(([kind, direction, text], index) => {
    const layout = speechBubbleLayout(text, 22);
    const column = index % 4;
    const row = Math.floor(index / 4);
    const rect = {
      x: content.x + column * 200,
      y: content.y + 4 + row * 82,
      width: Math.max(120, layout.width),
      height: layout.height + 4,
    };
    drawSpeechBubble(context, fonts, skin, rect, layout, kind, direction);
    label(`${kind.toUpperCase()} / ${direction.toUpperCase()}`, rect.x + rect.width / 2, rect.y + rect.height + 7, {
      align: 'center', color: '#8b5a3c',
    });
  });

  const toastY = content.y + 176;
  const toasts = [
    ['INFO — APPLES ADDED', skin.button, '#5f3b24'],
    ['SUCCESS — QUEST COMPLETE', skin.buttonConfirm, '#fff2d0'],
    ['FAILURE — SLOT BLOCKED', skin.buttonDeny, '#fff2d0'],
  ] as const;
  toasts.forEach(([text, asset, color], index) => {
    const rect = { x: content.x + index * 260, y: toastY, width: 246, height: 22 };
    drawUiSkinAsset(context, asset, rect, 'idle');
    label(text, rect.x + rect.width / 2, rect.y + 6, { align: 'center', color });
  });
  const tooltipRect = { x: content.x, y: toastY + 34, width: 220, height: 18 };
  drawUiLabelPlate(context, skin, tooltipRect);
  label('IRON AXE  54/100 DURABILITY', tooltipRect.x + tooltipRect.width / 2, tooltipRect.y + 5, {
    align: 'center', color: '#5f3b24',
  });

  sectionRibbon.draw(context, 'DYNAMIC TITLE RIBBON — GROWS TO FIT', content.x + 410, toastY + 31, {
    overflow: 'grow',
  });
  windowRibbon.drawStacked(context, 'ORCHARD HIGHLANDS — EASTERN RIDGE', 'SUMMER 12  ·  09:40  ·  LIGHT RAIN', {
    x: content.x + 590, y: toastY + 28, width: 190, height: 42,
  });
  windowRibbon.drawSingle(context, 'FIXED SINGLE-LINE RIBBON TITLE THAT ELLIPSIZES', {
    x: content.x + 330, y: toastY + 66, width: 240, height: 24,
  });

  const hudY = toastY + 96;
  label('HUD PLATES', content.x, hudY, { header: true, color: '#4d2e22' });
  const wallet = { x: content.x, y: hudY + 22, width: 260, height: 36 };
  drawUiFrame(context, skin, wallet, 'thin');
  currency.draw(context, 87_654n, wallet.x + 12, wallet.y + 10, { size: 'small' });
  drawUiSkinNatural(context, skin.backpackIcon, wallet.x + wallet.width - 28, wallet.y + 9);

  const resourceX = content.x + 290;
  label('PLAYER RESOURCES', resourceX, hudY, { color: '#6b4428' });
  fixtureResourceFrame.draw(context, 'ui-lab-hud-player', resourceX, hudY + 18, false, 4);
  drawProgressBar(context, { x: content.x, y: hudY + 76, width: 260, height: 11 }, 0.34, RED_PROGRESS_PALETTE);
  label('COMPACT FALLBACK METER', content.x, hudY + 94, { color: '#8b5a3c' });

  const cursorX = content.x + 610;
  label('WORLD ANCHORS', cursorX, hudY, { header: true, color: '#4d2e22' });
  drawUiSkinNatural(context, skin.cursor, cursorX, hudY + 24);
  drawUiSkinNatural(context, skin.cursorClick, cursorX + 44, hudY + 24);
  drawUiSkinNatural(context, skin.crosshair, cursorX + 90, hudY + 24);
  drawUiSkinNatural(context, skin.selectorNeutral, cursorX - 6, hudY + 72, 'idle');
  drawUiSkinNatural(context, skin.selectorConfirm, cursorX + 54, hudY + 72, 'idle');
  drawUiSkinNatural(context, skin.selectorDeny, cursorX + 114, hudY + 72, 'idle');
}

function mockSlot(rect: UiRect, item?: ItemStack): void {
  drawUiInventorySlot(context, fonts, skin, itemArtwork, rect, item ?? null);
}

function drawPatterns(): void {
  const content = drawSection(
    SECTIONS.patterns,
    'COMPOSITION PATTERNS',
    'DIALOGUE / SHOP / QUEST MASTER–DETAIL / RECIPE / SETTINGS / TOUCH ACTIONS',
  );
  const dialogue = { x: content.x, y: content.y, width: 310, height: 140 };
  drawUiFrame(context, skin, dialogue, 'wood_parchment');
  windowRibbon.draw(context, 'DIALOGUE WITH A TITLE THAT MUST STAY INSIDE', dialogue.x + dialogue.width / 2, dialogue.y - 5, {
    maxWidth: dialogue.width - 24, overflow: 'ellipsis',
  });
  const portrait = { x: dialogue.x + 28, y: dialogue.y + 34, width: 62, height: 72 };
  drawUiFrame(context, skin, portrait, 'thin');
  drawUiRichText(context, fonts, layoutUiRichText(fonts, [{
    text: 'Marlow: The first apples are ready. Will you bring me twelve?',
  }], { x: dialogue.x + 108, y: dialogue.y + 34, width: 174, height: 54 }, { lineHeight: 10, maxLines: 4 }));
  drawButton(context, skin, fonts, { x: dialogue.x + 108, y: dialogue.y + 96, width: 82, height: 22 }, { label: 'ACCEPT', tone: 'success' });
  drawButton(context, skin, fonts, { x: dialogue.x + 198, y: dialogue.y + 96, width: 82, height: 22 }, { label: 'LATER' });

  const shop = { x: content.x + 330, y: content.y, width: 326, height: 216 };
  drawUiFrame(context, skin, shop, 'parchment');
  windowRibbon.draw(context, 'MARLOW’S SHOP', shop.x + shop.width / 2, shop.y - 5, {
    maxWidth: shop.width - 24, overflow: 'ellipsis',
  });
  for (let row = 0; row < 4; row += 1) {
    const y = shop.y + 34 + row * 38;
    mockSlot({ x: shop.x + 24, y, width: 28, height: 31 }, row === 0
      ? { itemKind: 'apple', quantity: 1 }
      : row === 1 ? { itemKind: 'axe', quantity: 1 }
        : row === 2 ? { itemKind: 'torch', quantity: 4 }
          : { itemKind: 'backpack', quantity: 1 });
    label(['APPLE', 'IRON AXE', 'TORCH ×4', 'BACKPACK'][row]!, shop.x + 62, y + 6);
    currency.draw(context, BigInt([12, 850, 45, 2500][row]!), shop.x + shop.width - 82, y + 8, {
      size: 'small', align: 'right', includeZero: false,
    });
  }
  drawButton(context, skin, fonts, { x: shop.x + 206, y: shop.y + 178, width: 96, height: 22 }, { label: 'BUY', tone: 'success' });

  const quest = { x: content.x, y: content.y + 162, width: 310, height: 260 };
  drawUiFrame(context, skin, quest, 'parchment');
  windowRibbon.draw(context, 'QUEST LOG', quest.x + quest.width / 2, quest.y - 5, {
    maxWidth: quest.width - 24, overflow: 'ellipsis',
  });
  const questInner = uiFrameContentRect(quest, 'parchment', 7);
  const master = { x: questInner.x, y: questInner.y + 12, width: 96, height: questInner.height - 46 };
  const detail = { x: master.x + master.width + 8, y: master.y, width: questInner.width - master.width - 8, height: master.height };
  drawUiFrame(context, skin, master, 'thin');
  drawUiFrame(context, skin, detail, 'thin');
  ['FIRST HARVEST', 'A LOST BOOK', 'CELLAR TOUR', 'STONE FORGE'].forEach((value, index) => {
    label(value, master.x + 8, master.y + 10 + index * 28, { color: index === 0 ? '#2d6f98' : '#6b4428' });
  });
  label('FIRST HARVEST', detail.x + 10, detail.y + 10, { header: true, color: '#4d2e22' });
  drawUiRichText(context, fonts, layoutUiRichText(fonts, [{
    text: 'Collect 12 apples and return to Marlow. Progress 7 / 12.',
  }], { x: detail.x + 10, y: detail.y + 34, width: detail.width - 20, height: 60 }, { lineHeight: 10 }));
  drawProgressBar(context, { x: detail.x + 10, y: detail.y + 96, width: detail.width - 20, height: 10 }, 7 / 12);
  drawButton(context, skin, fonts, { x: detail.x + 10, y: detail.y + detail.height - 30, width: 80, height: 22 }, { label: 'TRACK', tone: 'success' });
  drawButton(context, skin, fonts, { x: detail.x + detail.width - 90, y: detail.y + detail.height - 30, width: 80, height: 22 }, { label: 'DROP', tone: 'danger' });

  const settings = { x: content.x + 330, y: content.y + 236, width: 326, height: 186 };
  drawUiFrame(context, skin, settings, 'thin');
  label('SETTINGS / RECIPE / TOUCH', settings.x + settings.width / 2, settings.y + 12, {
    align: 'center', header: true, color: '#4d2e22',
  });
  label('MUSIC', settings.x + 18, settings.y + 44);
  drawUiSkinAsset(context, skin.sliderTrack, { x: settings.x + 80, y: settings.y + 46, width: 126, height: 6 });
  drawUiSkinNatural(context, skin.sliderHandle, settings.x + 154, settings.y + 42, 'idle');
  drawButton(context, skin, fonts, { x: settings.x + 224, y: settings.y + 36, width: 76, height: 22 }, { label: 'ON', tone: 'success' });
  label('CRAFT', settings.x + 18, settings.y + 82);
  [0, 1, 2].forEach((index) => mockSlot({ x: settings.x + 70 + index * 32, y: settings.y + 72, width: 28, height: 31 },
    index === 0 ? { itemKind: 'wood', quantity: 2 } : undefined));
  label('→', settings.x + 176, settings.y + 84, { header: true });
  mockSlot({ x: settings.x + 202, y: settings.y + 72, width: 28, height: 31 }, { itemKind: 'torch', quantity: 4 });
  const touchY = settings.y + 126;
  label('TOUCH', settings.x + 18, touchY + 8);
  [['E', skin.buttonConfirm], ['F', skin.button], ['●', skin.buttonDeny]].forEach(([value, asset], index) => {
    const rect = { x: settings.x + 82 + index * 70, y: touchY, width: 58, height: 28 };
    drawUiSkinAsset(context, asset as LoadedAsset, rect, 'idle');
    label(value as string, rect.x + rect.width / 2, rect.y + 8, { align: 'center', color: index === 1 ? '#5f3b24' : '#fff2d0' });
  });
}

function drawLabBookEmbed(
  target: CanvasRenderingContext2D,
  entry: GameBookEmbedEntry,
  rect: UiRect,
): boolean {
  target.fillStyle = entry.embedKind === 'chart' ? '#4aa4cc18' : '#e3a84b18';
  target.fillRect(rect.x, rect.y, rect.width, rect.height);
  target.strokeStyle = entry.embedKind === 'chart' ? '#2d6f98' : '#8b5a3c';
  target.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.width - 1), Math.max(0, rect.height - 1));
  if (entry.embedKind === 'item' && entry.reference in ITEM_DEFINITIONS) {
    const itemKind = entry.reference as keyof typeof ITEM_DEFINITIONS;
    const slot = {
      x: rect.x + 6,
      y: rect.y + Math.max(2, Math.floor((rect.height - 31) / 2)),
      width: 28,
      height: 31,
    };
    drawUiInventorySlot(target, fonts, skin, itemArtwork, slot, { itemKind, quantity: 1 });
    drawPixelTextInRect(target, fonts, entry.label ?? entry.reference, {
      x: slot.x + slot.width + 8,
      y: rect.y,
      width: Math.max(0, rect.width - slot.width - 20),
      height: rect.height,
    }, { color: '#51351f', verticalAlign: 'center', overflow: 'ellipsis' });
    return true;
  }
  if (entry.embedKind === 'chart') {
    const chartContent = insetRect(rect, { left: 6, top: 6, right: 6, bottom: 6 });
    const boxes = layoutUiFlex(chartContent, Array.from({ length: 3 }, () => ({
      minSize: { width: 44, height: 20 }, grow: 1,
    })), { direction: 'row', gap: 14, align: 'center' });
    ['PRESS', 'BARREL', 'CELLAR'].forEach((value, index) => {
      const box = boxes[index]!;
      target.fillStyle = index === 2 ? '#63c74d33' : '#4aa4cc33';
      target.fillRect(box.x, box.y, box.width, box.height);
      target.strokeStyle = '#2d6f98';
      target.strokeRect(box.x + 0.5, box.y + 0.5, box.width - 1, box.height - 1);
      drawPixelTextInRect(target, fonts, value, box, {
        align: 'center', verticalAlign: 'center', color: '#3f2832', overflow: 'ellipsis', paddingX: 3,
      });
      if (index < boxes.length - 1) drawPixelText(target, fonts, '→', box.x + box.width + 7, box.y + 7, {
        align: 'center', color: '#2d6f98',
      });
    });
    return true;
  }
  return false;
}

function drawMarkdownContractCard(rect: UiRect, title: string, copy: string): void {
  drawUiFrame(context, skin, rect, 'thin');
  const content = uiFrameContentRect(rect, 'thin', 7);
  drawPixelTextInRect(context, fonts, title, {
    x: content.x,
    y: content.y,
    width: content.width,
    height: 16,
  }, { font: 'header', color: '#4d2e22', overflow: 'ellipsis' });
  drawUiRichText(context, fonts, layoutUiRichText(fonts, [{ text: copy }], {
    x: content.x,
    y: content.y + 24,
    width: content.width,
    height: Math.max(0, content.height - 24),
  }, { lineHeight: 11, color: '#51351f' }));
}

function drawBooks(): void {
  const content = drawSection(
    SECTIONS.books,
    'BOOKS & GAME MARKDOWN',
    'AUTOMATIC PAGE FLOW / EXPLICIT PLACEMENT / PAGE NUMBERS / BOOKMARKS / TYPED LINKS + EMBEDS',
  );
  const rendered = drawGameBook(
    context, skin, fonts, gameBookLayout, markdownBookSpread, drawLabBookEmbed,
  );
  registerBookInteractions(gameBookLayout, rendered, (spreadIndex) => {
    markdownBookSpread = spreadIndex;
  }, 'MARKDOWN BOOK');
  drawPixelTextInRect(context, fonts,
    `INTERACTIVE SPREAD ${rendered.spreadIndex + 1}/${rendered.spreadCount} — ${gameBookLayout.pageCount} NUMBERED PAGES`, {
      x: gameBookFrame.x,
      y: gameBookFrame.y - 20,
      width: gameBookFrame.width,
      height: 12,
    }, { align: 'center', color: '#6b4428', overflow: 'ellipsis' });
  drawPixelTextInRect(context, fonts,
    'FIRST / PREVIOUS                                                     NEXT / LAST', {
      x: gameBookFrame.x,
      y: gameBookFrame.y + gameBookFrame.height + 23,
      width: gameBookFrame.width,
      height: 10,
    }, { align: 'center', color: '#8b5a3c', overflow: 'ellipsis' });

  const cardX = content.x + 1080;
  const cardWidth = content.width - 1080;
  drawMarkdownContractCard({ x: cardX, y: content.y + 4, width: cardWidth, height: 142 },
    'MARKDOWN-FIRST CONTENT CONTRACT',
    'One parsed document model feeds books and future rich-content frames. Common prose syntax stays familiar, while the game adds an allowlisted set of typed destinations and renderer extension points. Raw HTML is treated as text; javascript destinations never become links.');
  drawMarkdownContractCard({ x: cardX, y: content.y + 160, width: Math.floor((cardWidth - 14) / 2), height: 348 },
    'COMMON MARKDOWN',
    '# / ## / ### headings\n\nParagraphs and soft line joins\n\n**strong** and *emphasis*\n\n`inline code` and fenced code\n\n- unordered / 1. ordered lists\n\n> quotes and --- rules\n\n[docs](https://...) safe links');
  drawMarkdownContractCard({
    x: cardX + Math.ceil((cardWidth + 14) / 2),
    y: content.y + 160,
    width: Math.floor((cardWidth - 14) / 2),
    height: 348,
  }, 'ORCHARD EXTENSIONS',
  '[item:324234] shorthand\n\n[Apple](item:apple)\n\n[Mira](player:farmer-mira)\n\n[Place](coord:orchard,42,18)\n\n[Chapter](page:anchor)\n\n<!-- page: 5 --> exact placement\n\n<!-- bookmark: ... --> colored tabs\n\n<!-- embed: item | apple | Apple -->\n\nTyped chart/custom renderer hooks');
}

interface AssetSpecimen {
  readonly name: string;
  readonly asset: LoadedAsset;
  readonly state?: string;
}

function drawAssetPreview(specimen: AssetSpecimen, rect: UiRect): void {
  drawUiFrame(context, skin, rect, 'thin');
  const frame = uiAssetFrame(specimen.asset, specimen.state ?? 'base');
  if (frame !== null) {
    const maximumWidth = rect.width - 18;
    const maximumHeight = rect.height - 30;
    const scale = Math.min(3, maximumWidth / frame.width, maximumHeight / frame.height);
    const width = Math.max(1, Math.round(frame.width * scale));
    const height = Math.max(1, Math.round(frame.height * scale));
    context.drawImage(specimen.asset.image, frame.x, frame.y, frame.width, frame.height,
      Math.round(rect.x + (rect.width - width) / 2), rect.y + 7, width, height);
  }
  const fitted = specimen.name.length > 22 ? `${specimen.name.slice(0, 19)}...` : specimen.name;
  label(fitted, rect.x + rect.width / 2, rect.y + rect.height - 13, { align: 'center', color: '#6b4428' });
}

function drawAssets(): void {
  const content = drawSection(
    SECTIONS.assets,
    'AUTHORED SKIN & ICON COVERAGE',
    `${UI_LAB_COVERAGE.length} REGISTERED SPECIMENS — EVERY REUSABLE FAMILY HAS A VISIBLE CONTRACT`,
  );
  const assets: AssetSpecimen[] = [
    { name: 'panel wood', asset: skin.panelWood },
    { name: 'panel parchment', asset: skin.panelParchment },
    { name: 'frame thin', asset: skin.frameThin },
    { name: 'book open', asset: skin.bookOpen },
    { name: 'button idle', asset: skin.button, state: 'idle' },
    { name: 'button pressed', asset: skin.button, state: 'pressed' },
    { name: 'button disabled', asset: skin.button, state: 'disabled' },
    { name: 'button confirm', asset: skin.buttonConfirm, state: 'idle' },
    { name: 'button deny', asset: skin.buttonDeny, state: 'idle' },
    { name: 'button small', asset: skin.buttonSmall, state: 'idle' },
    { name: 'small confirm', asset: skin.buttonSmallConfirm, state: 'idle' },
    { name: 'slot', asset: skin.slot, state: 'idle' },
    { name: 'selector neutral', asset: skin.selectorNeutral, state: 'idle' },
    { name: 'selector confirm', asset: skin.selectorConfirm, state: 'idle' },
    { name: 'selector deny', asset: skin.selectorDeny, state: 'idle' },
    { name: 'slider track', asset: skin.sliderTrack },
    { name: 'slider handle', asset: skin.sliderHandle, state: 'idle' },
    { name: 'bar frame', asset: skin.barFrame },
    { name: 'bar red', asset: skin.barRed },
    { name: 'bar green', asset: skin.barGreen },
    { name: 'bar blue', asset: skin.barBlue },
    { name: 'bar gold', asset: skin.barGold },
    { name: 'ribbon', asset: skin.ribbon },
    { name: 'banner', asset: skin.banner },
    { name: 'bubble', asset: skin.bubble },
    { name: 'speech beige', asset: skin.speechBubbleBeige },
    { name: 'speech white', asset: skin.speechBubbleWhite },
    { name: 'speech green', asset: skin.speechBubbleGreen },
    { name: 'speech blue', asset: skin.speechBubbleBlue },
    { name: 'speech yellow', asset: skin.speechBubbleYellow },
    { name: 'speech red', asset: skin.speechBubbleRed },
    { name: 'speech purple', asset: skin.speechBubblePurple },
    { name: 'coin gold', asset: skin.coinGold },
    { name: 'coin silver', asset: skin.coinSilver },
    { name: 'coin bronze', asset: skin.coinBronze },
    { name: 'chat icon', asset: skin.chatIcon },
    { name: 'crafting icon', asset: skin.craftingIcon },
    { name: 'backpack icon', asset: skin.backpackIcon },
    { name: 'players icon', asset: skin.onlinePlayersIcon },
    { name: 'book tab', asset: skin.bookTab },
    { name: 'cursor', asset: skin.cursor },
    { name: 'cursor click', asset: skin.cursorClick },
    { name: 'crosshair', asset: skin.crosshair },
    { name: 'well rested', asset: skin.effectWellRested },
    { name: 'winded', asset: skin.effectWinded },
    { name: 'orchard tea', asset: skin.effectOrchardTea },
  ];
  const columns = 12;
  const cardWidth = 184;
  const cardHeight = 78;
  assets.forEach((asset, index) => drawAssetPreview(asset, {
    x: content.x + index % columns * (cardWidth + 8),
    y: content.y + Math.floor(index / columns) * (cardHeight + 8),
    width: cardWidth,
    height: cardHeight,
  }));

  const iconNames = Object.keys(skin.icons) as UiIconName[];
  const iconY = content.y + 4 * (cardHeight + 8);
  iconNames.forEach((name, index) => {
    const x = content.x + index * 78;
    drawUiIconAsset(context, skin.icons[name], { x: x + 22, y: iconY, width: 24, height: 24 });
    label(name.toUpperCase(), x + 34, iconY + 30, { align: 'center', color: '#8b5a3c' });
  });
  label('LUCIDE EDITOR/GAME CHROME — KEPT AS CRISP SVG SOURCES', content.x + 900, iconY + 8, {
    color: '#6b4428',
  });
}

function drawToolbar(): void {
  const height = 42;
  drawUiSkinAsset(context, skin.panelWood, { x: 0, y: 0, width: cssWidth, height });
  const buttonStripX = cssWidth - 202;
  const showZoom = cssWidth >= 520;
  const titleRight = buttonStripX - (showZoom ? 62 : 8);
  drawPixelTextInRect(context, fonts, 'ORCHARD UI COMPONENT LAB', {
    x: 18,
    y: 8,
    width: Math.max(0, Math.min(230, titleRight - 18)),
    height: 26,
  }, { font: 'header', color: '#fff2d0', verticalAlign: 'center', overflow: 'ellipsis' });
  const statusX = 268;
  const statusWidth = Math.max(0, buttonStripX - statusX - 60);
  if (statusWidth > 18) drawPixelTextInRect(context, fonts, interactionStatus, {
    x: statusX,
    y: 9,
    width: statusWidth,
    height: 24,
  }, { color: '#f6ca9f', verticalAlign: 'center', overflow: 'ellipsis' });
  if (showZoom) drawPixelTextInRect(context, fonts, `${Math.round(zoom * 100)}%`, {
    x: buttonStripX - 54,
    y: 9,
    width: 46,
    height: 24,
  }, { align: 'right', color: '#fff2d0', verticalAlign: 'center', overflow: 'ellipsis' });
  drawButton(context, skin, fonts, { x: cssWidth - 202, y: 9, width: 58, height: 24 }, { label: 'FIT' });
  drawButton(context, skin, fonts, { x: cssWidth - 138, y: 9, width: 58, height: 24 }, { label: '1:1' });
  drawButton(context, skin, fonts, { x: cssWidth - 74, y: 9, width: 58, height: 24 }, { label: 'HOME', tone: 'success' });
}

function drawHeldCursorStack(): void {
  const held = inventory.cursor;
  if (held === null) return;
  const rect = { x: pointerWorld.x - 14, y: pointerWorld.y - 15, width: 28, height: 31 };
  context.save();
  context.globalAlpha = 0.9;
  drawUiInventorySlot(context, fonts, skin, itemArtwork, rect, held, { selected: true });
  context.restore();
}

function render(): void {
  worldHits = [];
  inventorySlotRegions = [];
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, cssWidth, cssHeight);
  drawCheckerboard();
  context.save();
  context.translate(cssWidth / 2 - camera.x * zoom, cssHeight / 2 - camera.y * zoom);
  context.scale(zoom, zoom);
  drawWorldGrid();
  label('ORCHARD & CELLAR — CANVAS UI SYSTEM', 60, 45, {
    header: true, scale: 2, color: '#181425', outline: true, outlineColor: '#ffffff',
  });
  label('PUBLIC / AUTH-FREE / PAN + ZOOM / INTERACTIVE CONTRACT TESTS', 62, 76, { color: '#b9d3c2', outline: true });
  drawFoundations();
  drawFrames();
  drawControls();
  drawInventory();
  drawFeedback();
  drawPatterns();
  drawBooks();
  drawAssets();
  drawHeldCursorStack();
  context.restore();
  drawToolbar();
}

function resize(): void {
  cssWidth = Math.max(1, Math.floor(innerWidth));
  cssHeight = Math.max(1, Math.floor(innerHeight));
  dpr = Math.max(1, devicePixelRatio);
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  if (!cameraInitialized) {
    zoom = Math.max(0.55, Math.min(1, cssWidth / 1800, cssHeight / 920));
    cameraInitialized = true;
  }
  requestUiLabRender();
}

function screenPoint(event: PointerEvent | WheelEvent): UiPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * cssWidth / Math.max(1, rect.width),
    y: (event.clientY - rect.top) * cssHeight / Math.max(1, rect.height),
  };
}

function screenToWorld(point: UiPoint): UiPoint {
  return {
    x: camera.x + (point.x - cssWidth / 2) / zoom,
    y: camera.y + (point.y - cssHeight / 2) / zoom,
  };
}

function slotAt(point: UiPoint): InventorySlotRegion | null {
  for (let index = inventorySlotRegions.length - 1; index >= 0; index -= 1) {
    const slot = inventorySlotRegions[index]!;
    if (containsPoint(slot.rect, point)) return slot;
  }
  return null;
}

function fitWorld(): void {
  zoom = Math.max(0.2, Math.min(1, Math.min(
    (cssWidth - 80) / WORLD_BOUNDS.width,
    (cssHeight - 100) / WORLD_BOUNDS.height,
  )));
  camera = { x: WORLD_BOUNDS.width / 2, y: WORLD_BOUNDS.height / 2 };
  notify('FIT ALL SPECIMENS');
}

function homeView(): void {
  camera = { x: 880, y: 430 };
  zoom = Math.max(0.55, Math.min(1, cssWidth / 1800, cssHeight / 920));
  notify('HOME — FOUNDATIONS, FRAMES, AND CONTROLS');
}

canvas.addEventListener('pointerdown', (event) => {
  pointerScreen = screenPoint(event);
  pointerWorld = screenToWorld(pointerScreen);
  if (pointerScreen.y < 42 && event.button === 0) {
    if (pointerScreen.x >= cssWidth - 202 && pointerScreen.x < cssWidth - 144) fitWorld();
    else if (pointerScreen.x >= cssWidth - 138 && pointerScreen.x < cssWidth - 80) {
      zoom = 1;
      notify('ZOOM 1:1');
    } else if (pointerScreen.x >= cssWidth - 74) homeView();
    return;
  }
  const selectedMetrics = UI_FRAME_METRICS[selectedResponsiveStyle];
  const responsiveMinimum = selectedResponsiveStyle === 'book'
    ? selectedMetrics.minimumSize
    : {
      width: Math.max(238, selectedMetrics.minimumSize.width),
      height: Math.max(160, selectedMetrics.minimumSize.height),
    };
  if (selectedMetrics.resizable && resizeController.pointerDown(
    pointerWorld, event.button, responsiveFrame, responsiveMinimum, {
    width: responsiveResizeBounds.width, height: responsiveResizeBounds.height,
    },
  )) {
    activeInteraction = { kind: 'resize' };
    canvas.setPointerCapture(event.pointerId);
    notify('RESIZING RESPONSIVE FRAME');
    return;
  }
  for (let index = worldHits.length - 1; index >= 0; index -= 1) {
    const hit = worldHits[index]!;
    if (!containsPoint(hit.rect, pointerWorld)) continue;
    hit.onDown(pointerWorld, event);
    if (activeInteraction !== null) canvas.setPointerCapture(event.pointerId);
    return;
  }
  if (event.button === 0 || event.button === 1 || pressedSpace) {
    nativeInput.blur();
    activeInteraction = { kind: 'pan', pointer: pointerScreen, camera };
    canvas.setPointerCapture(event.pointerId);
  }
});

canvas.addEventListener('pointermove', (event) => {
  pointerScreen = screenPoint(event);
  pointerWorld = screenToWorld(pointerScreen);
  const hovered = slotAt(pointerWorld);
  hoveredInventorySlot = hovered?.ref ?? null;
  if (activeInteraction?.kind === 'pan') {
    camera = {
      x: activeInteraction.camera.x - (pointerScreen.x - activeInteraction.pointer.x) / zoom,
      y: activeInteraction.camera.y - (pointerScreen.y - activeInteraction.pointer.y) / zoom,
    };
  } else if (activeInteraction?.kind === 'resize') {
    const next = resizeController.pointerMove(pointerWorld, responsiveResizeBounds);
    if (next !== null) responsiveFrame = next;
  } else if (activeInteraction?.kind === 'slider') slider.pointerMove(pointerWorld);
  else if (activeInteraction?.kind === 'scrollbar') scrollBar.pointerMove(pointerWorld);
  else if (activeInteraction?.kind === 'inventory' && hovered !== null) inventory.pointerEnter(hovered.ref);
  requestUiLabRender();
});

function finishPointer(event: PointerEvent): void {
  pointerScreen = screenPoint(event);
  pointerWorld = screenToWorld(pointerScreen);
  if (activeInteraction?.kind === 'resize') resizeController.pointerUp();
  else if (activeInteraction?.kind === 'slider') slider.pointerUp(pointerWorld);
  else if (activeInteraction?.kind === 'scrollbar') scrollBar.pointerUp();
  else if (activeInteraction?.kind === 'inventory') {
    const action = inventory.pointerUp(slotAt(pointerWorld)?.ref);
    notify(action.status);
  }
  activeInteraction = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  requestUiLabRender();
}

canvas.addEventListener('pointerup', finishPointer);
canvas.addEventListener('pointercancel', (event) => {
  inventory.cancel();
  resizeController.cancel();
  slider.pointerLeave();
  scrollBar.pointerLeave();
  finishPointer(event);
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  pointerScreen = screenPoint(event);
  pointerWorld = screenToWorld(pointerScreen);
  if (containsPoint(sliderRect, pointerWorld)) {
    slider.node.onWheel?.({ point: pointerWorld, deltaX: event.deltaX, deltaY: event.deltaY }, slider.node);
    return;
  }
  if (containsPoint(scrollRect, pointerWorld)) {
    scrollBar.wheel(event.deltaY);
    notify(`SCROLL ${scrollBar.position}/${scrollBar.maximum}`);
    return;
  }
  const before = pointerWorld;
  zoom = Math.max(0.2, Math.min(3, zoom * Math.exp(-event.deltaY * 0.0014)));
  camera = {
    x: before.x - (pointerScreen.x - cssWidth / 2) / zoom,
    y: before.y - (pointerScreen.y - cssHeight / 2) / zoom,
  };
  requestUiLabRender();
}, { passive: false });

window.addEventListener('keydown', (event) => {
  if (document.activeElement === nativeInput) {
    if (event.key === 'Escape') nativeInput.blur();
    return;
  }
  if (event.code === 'Space') {
    pressedSpace = true;
    event.preventDefault();
  } else if (event.key.toLowerCase() === 'f') fitWorld();
  else if (event.key === '1') { zoom = 1; notify('ZOOM 1:1'); }
  else if (event.key === '0') homeView();
  else if (event.key === 'Escape') {
    inventory.cancel();
    resizeController.cancel();
    activeInteraction = null;
    notify('ACTIVE INTERACTION CANCELLED');
  }
});
window.addEventListener('keyup', (event) => {
  if (event.code === 'Space') pressedSpace = false;
});
window.addEventListener('resize', resize);

resize();
setLoadingScreenStage({
  title: 'UI LAB READY', detail: 'PAN, ZOOM, RESIZE, TYPE, AND DRAG ITEM STACKS', progress: 100, ready: true,
});
dismissLoadingScreen();
requestUiLabRender();
window.setInterval(() => {
  if (document.activeElement === nativeInput) requestUiLabRender();
}, 530);
