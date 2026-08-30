import {
  ITEM_DEFINITIONS,
  type ContainerSnapshot,
  type ItemStack,
} from '@orchard/sim';
import { dismissLoadingScreen, setLoadingScreenStage } from './loading-screen.js';
import { loadGeneratedAsset, type LoadedAsset } from './render/assets.js';
import {
  CUTE_FANTASY_ACTOR_CATALOG,
  cuteFantasyActor,
  type CuteFantasyActorCatalogEntry,
  type CuteFantasyActorKind,
} from './render/cute-fantasy-actor-library.js';
import {
  drawOutlinedPixelText,
  drawPixelText,
  drawPixelTextInRect,
  loadPixelUi,
} from './render/pixel-ui.js';
import {
  BUTTON_HEIGHT,
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
  uiFrameBodyRect,
  uiFrameControlLayout,
  uiFrameContentRect,
  type UiFrameStyle,
  type UiInventoryGroupOptions,
  type UiInventorySlotRef,
  UiInventoryInteractionModel,
  drawUiInventorySlot,
  layoutUiInventoryGroup,
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
  FANTASY_BUTTON_GLYPHS,
  FANTASY_BUTTON_SHAPES,
  FANTASY_BUTTON_TONES,
  FANTASY_ICON_CATALOG_COLUMNS,
  FANTASY_ICON_CATALOG_ROWS,
  FANTASY_ICON_FAMILIES,
  FantasyCanvasButton,
  drawFantasyButton,
  drawFantasyIcon,
  drawFantasyIconCell,
} from './ui/design-system/index.js';
import { containsPoint, insetRect, type UiPoint, type UiRect } from './ui/geometry.js';
import { drawProgressBar, GREEN_PROGRESS_PALETTE, RED_PROGRESS_PALETTE } from './ui/progress-bar.js';
import { PlayerResourceFrame } from './ui/player-resource-frame.js';
import { Ribbon } from './ui/ribbon.js';
import { ScrollBar } from './ui/scrollbar.js';
import {
  drawUiLabelPlate,
  uiAssetFrame,
  drawUiSkinAsset,
  drawUiSkinNatural,
  loadUiSkin,
  type UiIconName,
} from './ui/skin.js';
import {
  AUTHORED_SLIDER_CATALOG_COLUMNS,
  AUTHORED_SLIDER_CATALOG_ROWS,
  Slider,
  drawAuthoredSliderCell,
} from './ui/slider.js';
import {
  AUTHORED_SELECTOR_COLUMNS,
  AUTHORED_SELECTOR_ROWS,
  drawAuthoredSelectorCell,
} from './ui/selector.js';
import {
  drawSpeechBubble,
  speechBubbleLayout,
  type SpeechBubbleDirection,
  type SpeechBubbleKind,
} from './ui/speech-bubble.js';
import { Toggle, drawToggleSwitch } from './ui/toggle.js';
import {
  UI_LAB_MIGRATION_SURFACES,
  type UiLabMigrationSurfaceId,
} from './ui/ui-lab-catalog.js';

const canvasElement = document.querySelector<HTMLCanvasElement>('#game');
const shellElement = document.querySelector<HTMLElement>('#game-shell');
if (canvasElement === null || shellElement === null) throw new Error('UI lab canvas unavailable');
const canvas: HTMLCanvasElement = canvasElement;
const shell: HTMLElement = shellElement;
const canvasContext = canvas.getContext('2d');
if (canvasContext === null) throw new Error('Canvas 2D unavailable');
const context: CanvasRenderingContext2D = canvasContext;

canvas.classList.add('ui-lab-canvas');
canvas.setAttribute('aria-label', `Orchard and Cellar public UI component lab with 27 live UI migration candidates and ${CUTE_FANTASY_ACTOR_CATALOG.length} imported actor and effect specimens. Pan and zoom the specimen canvas; press M to jump to the live UI gallery.`);
shell.classList.add('ui-lab-shell');

setLoadingScreenStage({
  title: 'OPENING THE UI LAB', detail: 'LOADING AUTHORED SKINS AND ITEM ART', progress: 56,
});

const ITEM_ART_KINDS = [
  'wood', 'plank', 'stone', 'iron_ore', 'iron_bar', 'apple', 'grape', 'axe', 'pickaxe', 'torch', 'lantern',
  'ring', 'helm', 'tunic', 'backpack', 'chest', 'barrel', 'workbench', 'furnace',
  'cooking_fire', 'orchard_tea',
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

const WORLD_BOUNDS: UiRect = { x: 0, y: 0, width: 5900, height: 4750 };
const SECTIONS = {
  foundations: { x: 60, y: 100, width: 720, height: 430 },
  frames: { x: 820, y: 100, width: 880, height: 650 },
  controls: { x: 1740, y: 100, width: 720, height: 520 },
  inventory: { x: 60, y: 570, width: 720, height: 650 },
  feedback: { x: 820, y: 790, width: 880, height: 570 },
  patterns: { x: 1740, y: 790, width: 720, height: 570 },
  books: { x: 60, y: 1400, width: 2400, height: 650 },
  fantasyControls: { x: 60, y: 2090, width: 2400, height: 1000 },
  actors: { x: 60, y: 3130, width: 2400, height: 1000 },
  migration: { x: 2540, y: 70, width: 3300, height: 4440 },
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
let verticalSliderRect: UiRect = { x: 0, y: 0, width: 0, height: 0 };
let scrollRect: UiRect = { x: 0, y: 0, width: 0, height: 0 };
let renderRequest: number | null = null;
let actorAnimationTimer: number | null = null;
let uiLabDisposed = false;
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let selectedActorKind: CuteFantasyActorKind | 'all' = 'all';
let selectedActorId = 'npc_cf_farmer_bob';
let actorCatalogPage = 0;
const actorAssetCache = new Map<string, LoadedAsset>();
const actorAssetLoads = new Map<string, Promise<void>>();
const actorAssetErrors = new Set<string>();

function requestUiLabRender(): void {
  if (uiLabDisposed || renderRequest !== null) return;
  renderRequest = requestAnimationFrame(() => {
    renderRequest = null;
    render();
  });
}

function scheduleActorAnimationRender(): void {
  if (uiLabDisposed || reducedMotionQuery.matches || actorAnimationTimer !== null) return;
  actorAnimationTimer = window.setTimeout(() => {
    actorAnimationTimer = null;
    requestUiLabRender();
  }, 80);
}

function requestActorAsset(name: string): LoadedAsset | null {
  const loaded = actorAssetCache.get(name);
  if (loaded !== undefined) return loaded;
  if (!actorAssetLoads.has(name) && !actorAssetErrors.has(name)) {
    const load = loadGeneratedAsset(name, 'summer')
      .then((asset) => {
        actorAssetCache.set(name, asset);
        requestUiLabRender();
      })
      .catch(() => {
        actorAssetErrors.add(name);
        requestUiLabRender();
      });
    actorAssetLoads.set(name, load);
  }
  return null;
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
const verticalSlider = new Slider({
  id: 'ui-lab-slider-vertical', skin, value: 0.35, orientation: 'vertical', tone: 'green',
  onChange: (value) => notify(`VERTICAL SLIDER ${(value * 100).toFixed(0)}%`),
});
const migrationMasterSlider = new Slider({
  id: 'ui-lab-migration-master-volume', skin, value: 0.82, tone: 'gold',
  onChange: (value) => notify(`MIGRATION SETTINGS MASTER VOLUME ${Math.round(value * 100)}%`),
});
const migrationMusicSlider = new Slider({
  id: 'ui-lab-migration-music-volume', skin, value: 0.64, tone: 'green',
  onChange: (value) => notify(`MIGRATION SETTINGS MUSIC VOLUME ${Math.round(value * 100)}%`),
});
const migrationSoundSlider = new Slider({
  id: 'ui-lab-migration-sound-volume', skin, value: 0.76, tone: 'silver',
  onChange: (value) => notify(`MIGRATION SETTINGS SOUND VOLUME ${Math.round(value * 100)}%`),
});
const toggleOn = new Toggle({
  id: 'ui-lab-toggle-on', skin, fonts, value: true,
  onChange: (value) => notify(`TOGGLE ${value ? 'ON' : 'OFF'}`),
});
const toggleOff = new Toggle({
  id: 'ui-lab-toggle-off', skin, fonts, value: false,
  onChange: (value) => notify(`SECONDARY TOGGLE ${value ? 'ON' : 'OFF'}`),
});
const toggleDisabled = new Toggle({
  id: 'ui-lab-toggle-disabled', skin, fonts, value: false, style: 'neutral',
  onChange: () => undefined,
});
toggleDisabled.enabled = false;
const migrationNameplatesToggle = new Toggle({
  id: 'ui-lab-migration-nameplates', skin, fonts, value: true,
  onChange: (value) => notify(`MIGRATION SETTINGS NAMEPLATES ${value ? 'ON' : 'OFF'}`),
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
  'The close action reserves a safe header lane; navigation and page numbers keep their own mounts.',
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

const fantasyToneButtons = FANTASY_BUTTON_TONES.flatMap((tone) =>
  FANTASY_BUTTON_SHAPES.map((shape) => new FantasyCanvasButton({
    id: `lab-fantasy-${tone}-${shape}`,
    skin,
    fonts,
    tone,
    shape,
    size: 'wide',
    label: shape.toUpperCase(),
    glyph: shape === 'pill' ? 'cross' : undefined,
    onPress: () => notify(`${tone.toUpperCase()} ${shape.toUpperCase()} BUTTON PRESSED`),
  })),
);

const fantasyGlyphButtons = FANTASY_BUTTON_GLYPHS.map((glyph, index) => new FantasyCanvasButton({
  id: `lab-fantasy-glyph-${glyph}`,
  skin,
  fonts,
  tone: FANTASY_BUTTON_TONES[index % FANTASY_BUTTON_TONES.length],
  shape: FANTASY_BUTTON_SHAPES[index % FANTASY_BUTTON_SHAPES.length],
  size: 'small',
  glyph,
  hoverOutline: index % 2 === 0 ? 'gold' : 'white',
  onPress: () => notify(`AUTHORED GLYPH BUTTON ${glyph.toUpperCase()} PRESSED`),
}));

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
  | { readonly kind: 'slider'; readonly control: Slider }
  | { readonly kind: 'scrollbar' }
  | { readonly kind: 'inventory' };

let activeInteraction: ActiveInteraction | null = null;

function addHit(rect: UiRect, onDown: WorldHit['onDown']): void {
  worldHits.push({ rect, onDown });
}

function worldRectVisible(rect: UiRect): boolean {
  const halfWidth = cssWidth / Math.max(zoom, 0.001) / 2;
  const halfHeight = cssHeight / Math.max(zoom, 0.001) / 2;
  return rect.x + rect.width >= camera.x - halfWidth
    && rect.x <= camera.x + halfWidth
    && rect.y + rect.height >= camera.y - halfHeight
    && rect.y <= camera.y + halfHeight;
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
  addHit(result.controls.close, () => notify(`${name} CLOSE CONTROL — SHARED SAFE-AREA MOUNT`));
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

function debugContent(rect: UiRect, caption: string, leadingInset = 0): void {
  context.save();
  context.setLineDash([4, 3]);
  context.strokeStyle = '#2d6f98';
  context.fillStyle = '#4aa4cc18';
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
  context.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.width - 1), Math.max(0, rect.height - 1));
  context.restore();
  drawPixelTextInRect(context, fonts, caption, {
    x: rect.x + 4 + leadingInset,
    y: rect.y + 4,
    width: Math.max(0, rect.width - 8 - leadingInset),
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
    debugContent(left, 'LEFT PAGE', 26);
    debugContent(right, 'RIGHT PAGE');
  } else debugContent(uiFrameContentRect(frame, style), 'SAFE', 26);
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
    'SAFE AREAS / NAMED SLOTS / FIT + GROW + PERCENT / ATTACH POINTS / LIVE RESIZE',
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
    { minSize: { width: 24, height: 22 }, main: { mode: 'fit', preferred: 46 } },
    { minSize: { width: 34, height: 30 }, main: { mode: 'grow', weight: 1 } },
    { minSize: { width: 24, height: 16 }, main: { mode: 'percent', fraction: 0.28 } },
  ], { gap: 5, align: 'center' });
  flexRects.forEach((rect, index) => {
    context.fillStyle = ['#4aa4cc', '#63c74d', '#e3a84b'][index]!;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
    drawPixelTextInRect(context, fonts, ['FIT', 'GROW', '28%'][index]!, rect, {
      align: 'center', verticalAlign: 'center', color: '#fff4dc', overflow: 'ellipsis',
    });
  });
  const grid = layoutUiGrid({ ...flowContent, y: flowContent.y + 52, height: 65 }, Array.from({ length: 7 }, () => ({
    width: 22, height: 16,
  })), { columns: 'auto', minColumnWidth: 46, columnGap: 4, rowGap: 4, rowHeight: 22, justifyItems: 'center', alignItems: 'center' });
  grid.items.forEach((rect, index) => {
    context.fillStyle = index % 2 === 0 ? '#9d6843' : '#8d5aa7';
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  });
  drawPixelTextInRect(context, fonts, `BOUNDED FLOW + AUTO GRID (${grid.columns} COL)`, {
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
  const responsiveBody = uiFrameBodyRect(responsiveFrame, selectedResponsiveStyle, 5, 5);
  const controlLayout = uiFrameControlLayout(responsiveFrame, selectedResponsiveStyle, false);
  const variant = uiContainerVariant(responsiveContent.width);
  drawPixelTextInRect(
    context,
    fonts,
    `LIVE ${selectedResponsiveStyle.toUpperCase()}: ${variant.toUpperCase()}  ${Math.round(responsiveFrame.width)}×${Math.round(responsiveFrame.height)}`,
    {
      x: controlLayout.close.x + controlLayout.close.width + 5,
      y: responsiveContent.y,
      width: Math.max(0, responsiveContent.x + responsiveContent.width
        - controlLayout.close.x - controlLayout.close.width - 5),
      height: 14,
    },
    { font: 'header', color: '#4d2e22', overflow: 'ellipsis' },
  );
  const headerOffset = variant === 'compact' ? 18 : 24;
  const showResizeHint = variant !== 'compact' && responsiveContent.height >= 90;
  const resizeHintHeight = showResizeHint ? 16 : 0;
  const responseBounds = {
    x: responsiveContent.x,
    y: Math.max(responsiveBody.y, responsiveContent.y + headerOffset),
    width: responsiveContent.width,
    height: Math.max(28, responsiveContent.y + responsiveContent.height
      - Math.max(responsiveBody.y, responsiveContent.y + headerOffset) - resizeHintHeight),
  };
  const responseItems = variant === 'compact'
    ? [
      { minSize: { width: 32, height: BUTTON_HEIGHT.regular }, grow: 1 },
      { minSize: { width: 32, height: BUTTON_HEIGHT.regular }, grow: 1 },
      { minSize: { width: 32, height: BUTTON_HEIGHT.regular }, grow: 1 },
    ]
    : [
      // `basis` is the preferred label width; the small visual minimum is the
      // canvas equivalent of CSS `min-width: 0`, allowing all three controls
      // to shrink and ellipsize before any one can leave the frame content.
      { minSize: { width: 32, height: BUTTON_HEIGHT.regular }, basis: 76, grow: 1 },
      { minSize: { width: 32, height: BUTTON_HEIGHT.regular }, basis: 106, grow: 1 },
      { minSize: { width: 32, height: BUTTON_HEIGHT.regular }, basis: 132, grow: 1 },
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
    'TABS / EDITOR ICONS / SLIDER / TOGGLE / SCROLL / PROGRESS / CURRENCY / RESOURCES',
  );
  // Shape/tone/state/size matrices live once in the complete authored family
  // below. This section now concentrates on distinct input and indicator APIs.
  const tabY = content.y + 4;
  ['PACK', 'SKILLS', 'QUESTS'].forEach((tab, index) => {
    const rect = { x: content.x + index * 126, y: tabY, width: 120, height: BUTTON_HEIGHT.regular };
    drawButton(context, skin, fonts, rect, { label: tab, tone: selectedTab === index ? 'success' : 'neutral' });
    addHit(rect, () => { selectedTab = index; notify(`TAB ${tab}`); });
  });
  iconButton('save', { x: content.x + 408, y: tabY - 5, width: 32, height: 32 }, 'save');
  iconButton('undo', { x: content.x + 448, y: tabY - 5, width: 32, height: 32 }, 'undo');
  iconButton('redo', { x: content.x + 488, y: tabY - 5, width: 32, height: 32 }, 'redo');
  label('EDITOR CHROME', content.x + 536, tabY + 7, { color: '#8b5a3c' });

  sliderRect = { x: content.x, y: content.y + 60, width: 280, height: 16 };
  slider.setBounds(sliderRect);
  slider.draw(context);
  label(`SLIDER ${(slider.value * 100).toFixed(0)}%`, sliderRect.x + sliderRect.width + 12, sliderRect.y + 3, { color: '#6b4428' });
  addHit(sliderRect, (point, event) => {
    if (slider.node.onPointer?.({ kind: 'pointer_down', point, button: event.button }, slider.node)) {
      activeInteraction = { kind: 'slider', control: slider };
    }
  });

  const toggleOnRect = { x: content.x, y: content.y + 94, width: 72, height: BUTTON_HEIGHT.regular };
  const toggleOffRect = { x: content.x + 82, y: content.y + 94, width: 72, height: BUTTON_HEIGHT.regular };
  const toggleDisabledRect = { x: content.x + 164, y: content.y + 94, width: 88, height: BUTTON_HEIGHT.regular };
  toggleOn.setBounds(toggleOnRect); toggleOn.draw(context);
  toggleOff.setBounds(toggleOffRect); toggleOff.draw(context);
  toggleDisabled.setBounds(toggleDisabledRect); toggleDisabled.draw(context);
  label('ON', toggleOnRect.x + toggleOnRect.width / 2, toggleOnRect.y + 25, { align: 'center', color: '#6b4428' });
  label('OFF', toggleOffRect.x + toggleOffRect.width / 2, toggleOffRect.y + 25, { align: 'center', color: '#6b4428' });
  label('DISABLED', toggleDisabledRect.x + toggleDisabledRect.width / 2, toggleDisabledRect.y + 25,
    { align: 'center', color: '#8c6c54' });
  addHit(toggleOnRect, (point, event) => toggleOn.node.onPointer?.({ kind: 'pointer_down', point, button: event.button }, toggleOn.node));
  addHit(toggleOffRect, (point, event) => toggleOff.node.onPointer?.({ kind: 'pointer_down', point, button: event.button }, toggleOff.node));

  scrollRect = { x: content.x + 310, y: content.y + 60, width: 18, height: 88 };
  scrollBar.setBounds(scrollRect);
  scrollBar.draw(context);
  addHit(scrollRect, (point) => {
    if (scrollBar.pointerDown(point)) activeInteraction = { kind: 'scrollbar' };
  });
  label(`SCROLL ${scrollBar.position}/${scrollBar.maximum}`, scrollRect.x + 28, scrollRect.y + 38, { color: '#6b4428' });

  verticalSliderRect = { x: content.x + 590, y: content.y + 60, width: 16, height: 88 };
  verticalSlider.setBounds(verticalSliderRect);
  verticalSlider.draw(context);
  label(`VERT ${(verticalSlider.value * 100).toFixed(0)}%`, verticalSliderRect.x - 10,
    verticalSliderRect.y + verticalSliderRect.height + 9, { align: 'center', color: '#6b4428' });
  addHit(verticalSliderRect, (point, event) => {
    if (verticalSlider.node.onPointer?.({ kind: 'pointer_down', point, button: event.button }, verticalSlider.node)) {
      activeInteraction = { kind: 'slider', control: verticalSlider };
    }
  });

  const meterX = content.x;
  const meterY = content.y + 168;
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

  const authoredY = content.y + 280;
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
  const effectY = hudY + 132;
  label('VIGOUR EFFECT SEMANTICS', resourceX, effectY, { color: '#6b4428' });
  drawUiSkinAsset(context, skin.effectWellRested, {
    x: resourceX, y: effectY + 16, width: 32, height: 32,
  });
  label('WELL RESTED  +25% REGEN', resourceX + 42, effectY + 27, { color: '#6b4428' });
  drawUiSkinAsset(context, skin.effectWinded, {
    x: resourceX + 236, y: effectY + 16, width: 32, height: 32,
  });
  label('WINDED  -50% REGEN', resourceX + 278, effectY + 27, { color: '#6b4428' });
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

type MigrationButtonTone = (typeof FANTASY_BUTTON_TONES)[number];
type MigrationButtonGlyph = (typeof FANTASY_BUTTON_GLYPHS)[number];

const fantasyIconsById = new Map(FANTASY_ICON_FAMILIES.map((definition) => [definition.id, definition]));
const MIGRATION_CATEGORY_COLORS = {
  gateway: '#d9a441',
  world: '#4aa4cc',
  storage: '#9d6843',
  progression: '#8d5aa7',
  social: '#63c74d',
  menu: '#e43b44',
} as const;

const MIGRATION_LANE_COUNT = 3;
const MIGRATION_LANE_WIDTH = 1020;
const MIGRATION_LANE_GAP = 70;
const MIGRATION_LABEL_HEIGHT = 42;
const MIGRATION_FRAME_GAP = 64;

const MIGRATION_SPECIMEN_LAYOUT = (() => {
  const laneTops = Array.from(
    { length: MIGRATION_LANE_COUNT },
    () => SECTIONS.migration.y + 105,
  );
  return UI_LAB_MIGRATION_SURFACES.map((surface, index) => {
    const shortestTop = Math.min(...laneTops);
    const lane = laneTops.indexOf(shortestTop);
    const laneX = SECTIONS.migration.x + 30 + lane * (MIGRATION_LANE_WIDTH + MIGRATION_LANE_GAP);
    const frame = {
      x: laneX + Math.round((MIGRATION_LANE_WIDTH - surface.specimenSize.width) / 2),
      y: shortestTop + MIGRATION_LABEL_HEIGHT,
      width: surface.specimenSize.width,
      height: surface.specimenSize.height,
    };
    laneTops[lane] = frame.y + frame.height + MIGRATION_FRAME_GAP;
    return { surface, index, frame };
  });
})();

function drawMigrationWindow(
  frame: UiRect,
  title: string,
  closable = true,
  style: UiFrameStyle = 'wood_parchment',
): UiRect {
  drawUiFrame(context, skin, frame, style);
  windowRibbon.draw(context, title, frame.x + frame.width / 2, frame.y - 5, {
    maxWidth: Math.max(64, frame.width - 28), overflow: 'ellipsis',
  });
  const safe = uiFrameContentRect(frame, style, 6);
  if (!closable) return safe;
  const controls = drawUiFrameControls(context, skin, fonts, frame, style, {
    closeHovered: containsPoint(uiFrameControlLayout(frame, style).close, pointerWorld),
  });
  addHit(controls.close, () => notify(`${title.toUpperCase()} — CLOSE PREVIEW CONTROL`));
  return uiFrameBodyRect(frame, style, 6, 5);
}

function drawMigrationButtonRow(
  bounds: UiRect,
  actions: readonly {
    readonly label: string;
    readonly tone?: MigrationButtonTone;
    readonly glyph?: MigrationButtonGlyph;
    readonly disabled?: boolean;
  }[],
  gap = 5,
): readonly UiRect[] {
  const rects = layoutUiFlex(bounds, actions.map(() => ({
    minSize: { width: 30, height: bounds.height }, grow: 1,
  })), { gap, align: 'stretch' });
  actions.forEach((action, index) => drawFantasyButton(context, skin, fonts, rects[index]!, {
    tone: action.tone ?? 'peach',
    shape: 'chamfered',
    size: 'wide',
    state: action.disabled === true ? 'disabled' : 'idle',
    ...(action.glyph === undefined ? {} : { glyph: action.glyph }),
    label: action.label,
  }));
  return rects;
}

function drawMigrationSlotGrid(
  bounds: UiRect,
  columns: number,
  stacks: readonly (ItemStack | null)[],
  slotWidth = 38,
  options: Omit<UiInventoryGroupOptions, 'columns' | 'slotSize'> = {},
): readonly UiRect[] {
  const authoredSlotWidth = Math.max(18, Math.round(slotWidth));
  const layout = layoutUiInventoryGroup(bounds, stacks.length, {
    ...options,
    columns,
    slotSize: { width: authoredSlotWidth, height: authoredSlotWidth + 3 },
    gap: options.gap ?? 2,
  });
  layout.slots.forEach((rect, index) => {
    drawUiInventorySlot(context, fonts, skin, itemArtwork, rect, stacks[index] ?? null);
  });
  return layout.slots;
}

function drawMigrationInset(rect: UiRect, title?: string): UiRect {
  drawUiFrame(context, skin, rect, 'thin');
  const content = uiFrameContentRect(rect, 'thin', 5);
  if (title === undefined) return content;
  drawPixelTextInRect(context, fonts, title, {
    x: content.x,
    y: content.y,
    width: content.width,
    height: 12,
  }, { color: '#6b4428', overflow: 'ellipsis' });
  return {
    x: content.x,
    y: content.y + 15,
    width: content.width,
    height: Math.max(0, content.height - 15),
  };
}

function drawMigrationIcon(
  id: string,
  rect: UiRect,
  level = 0,
  hovered = false,
): void {
  const definition = fantasyIconsById.get(id);
  if (definition === undefined) return;
  drawFantasyIcon(context, skin, rect, definition, { level, hovered });
}

function drawMigrationSlider(sliderControl: Slider, rect: UiRect): void {
  sliderControl.setBounds(rect);
  sliderControl.draw(context);
  addHit(rect, (point, event) => {
    if (event.button !== 0) return;
    const captured = sliderControl.node.onPointer?.({
      kind: 'pointer_down', point, button: event.button,
    }, sliderControl.node) ?? false;
    if (captured) activeInteraction = { kind: 'slider', control: sliderControl };
  });
}

function drawMigrationToggle(toggleControl: Toggle, rect: UiRect): void {
  toggleControl.setBounds(rect);
  toggleControl.draw(context);
  addHit(rect, (point, event) => {
    toggleControl.node.onPointer?.({ kind: 'pointer_down', point, button: event.button }, toggleControl.node);
  });
}

function drawMigrationTabs(bounds: UiRect, labels: readonly string[], selected: number): void {
  const rects = layoutUiFlex(bounds, labels.map(() => ({
    minSize: { width: 24, height: bounds.height }, grow: 1,
  })), { gap: 3, align: 'stretch' });
  labels.forEach((value, index) => drawFantasyButton(context, skin, fonts, rects[index]!, {
    tone: index === selected ? 'green' : 'peach',
    shape: 'square',
    size: 'wide',
    label: value,
    state: index === selected ? 'pressed' : 'idle',
  }));
}

function drawMigrationListRows(
  bounds: UiRect,
  rows: readonly string[],
  selected = -1,
): void {
  const rowHeight = Math.max(13, Math.floor(bounds.height / Math.max(1, rows.length)));
  rows.forEach((value, index) => {
    const rect = {
      x: bounds.x,
      y: bounds.y + index * rowHeight,
      width: bounds.width,
      height: rowHeight - 2,
    };
    if (index === selected) {
      context.fillStyle = '#63c74d2e';
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
    drawPixelTextInRect(context, fonts, value, insetRect(rect, { left: 4, right: 4 }), {
      color: index === selected ? '#2d6f3b' : '#51351f',
      verticalAlign: 'center',
      overflow: 'ellipsis',
    });
  });
}

function drawMigrationSlotSection(
  bounds: UiRect,
  title: string,
  columns: number,
  stacks: readonly (ItemStack | null)[],
  slotWidth = 42,
  options: Omit<UiInventoryGroupOptions, 'columns' | 'slotSize'> = {},
): readonly UiRect[] {
  drawPixelTextInRect(context, fonts, title, {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: 13,
  }, { font: 'header', color: '#4d2e22', overflow: 'ellipsis' });
  return drawMigrationSlotGrid({
    x: bounds.x,
    y: bounds.y + 18,
    width: bounds.width,
    height: Math.max(0, bounds.height - 18),
  }, columns, stacks, slotWidth, options);
}

function drawMigrationDivider(x: number, y: number, width: number): void {
  context.fillStyle = '#9d6843';
  context.fillRect(Math.round(x), Math.round(y), Math.max(0, Math.round(width)), 2);
  context.fillStyle = '#f6ca9f';
  context.fillRect(Math.round(x), Math.round(y), Math.max(0, Math.round(width)), 1);
}

function drawMigrationVerticalDivider(x: number, y: number, height: number): void {
  context.fillStyle = '#9d6843';
  context.fillRect(Math.round(x), Math.round(y), 2, Math.max(0, Math.round(height)));
  context.fillStyle = '#f6ca9f';
  context.fillRect(Math.round(x), Math.round(y), 1, Math.max(0, Math.round(height)));
}

function drawMigrationHotbar(
  bounds: UiRect,
  stacks: readonly (ItemStack | null)[],
  columns = 10,
): readonly UiRect[] {
  drawMigrationDivider(bounds.x, bounds.y, bounds.width);
  return drawMigrationSlotSection({
    x: bounds.x + 8,
    y: bounds.y + 7,
    width: Math.max(0, bounds.width - 16),
    height: Math.max(0, bounds.height - 7),
  }, 'HOT BAR', columns, stacks, 46, { horizontalAlign: 'center' });
}

function drawMigrationObjectPortrait(
  rect: UiRect,
  itemKind: ItemStack['itemKind'],
  title: string,
  state = 'base',
  frameIndex = 0,
): void {
  const content = drawMigrationInset(rect, title);
  context.fillStyle = '#293630';
  context.fillRect(content.x, content.y, content.width, content.height);
  context.fillStyle = '#34483c';
  for (let y = content.y; y < content.y + content.height; y += 12) {
    for (let x = content.x; x < content.x + content.width; x += 12) {
      if ((Math.floor(x / 12) + Math.floor(y / 12)) % 2 !== 0) continue;
      context.fillRect(x, y, Math.min(12, content.x + content.width - x), Math.min(12, content.y + content.height - y));
    }
  }
  const asset = itemArtwork[itemKind];
  if (asset === undefined) return;
  const source = uiAssetFrame(asset, state, frameIndex);
  if (source === null) return;
  const availableWidth = Math.max(1, content.width - 16);
  const availableHeight = Math.max(1, content.height - 16);
  const scale = Math.max(1, Math.floor(Math.min(availableWidth / source.width, availableHeight / source.height)));
  const width = Math.min(availableWidth, source.width * scale);
  const height = Math.min(availableHeight, source.height * scale);
  const x = Math.round(content.x + (content.width - width) / 2);
  const y = Math.round(content.y + (content.height - height) / 2);
  context.save();
  context.imageSmoothingEnabled = false;
  context.drawImage(asset.image, source.x, source.y, source.width, source.height, x, y, width, height);
  context.restore();
}

function drawMigrationFarmerPortrait(rect: UiRect): void {
  const scale = Math.max(2, Math.floor(Math.min(rect.width / 13, rect.height / 20)));
  const width = 9 * scale;
  const height = 16 * scale;
  const x = Math.round(rect.x + (rect.width - width) / 2);
  const y = Math.round(rect.y + (rect.height - height) / 2);
  const pixel = (px: number, py: number, pw: number, ph: number, color: string): void => {
    context.fillStyle = color;
    context.fillRect(x + px * scale, y + py * scale, pw * scale, ph * scale);
  };
  pixel(2, 0, 5, 2, '#f2c15b');
  pixel(1, 2, 7, 5, '#f6ca9f');
  pixel(2, 3, 1, 2, '#3f2832');
  pixel(6, 3, 1, 2, '#3f2832');
  pixel(0, 7, 9, 2, '#2d6f3b');
  pixel(1, 9, 7, 4, '#3d8b47');
  pixel(1, 13, 3, 3, '#2d5f98');
  pixel(5, 13, 3, 3, '#2d5f98');
  pixel(0, 15, 4, 1, '#3f2832');
  pixel(5, 15, 4, 1, '#3f2832');
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

function drawMigrationSurface(id: UiLabMigrationSurfaceId, bounds: UiRect, closable: boolean): void {
  const frame = bounds;
  const slot = (itemKind: ItemStack['itemKind'], quantity = 1): ItemStack => ({ itemKind, quantity });

  switch (id) {
    case 'gateway': {
      const body = drawMigrationWindow(frame, 'ORCHARD & CELLAR', false);
      mockSlot({ x: body.x + Math.round((body.width - 34) / 2), y: body.y + 2, width: 32, height: 35 }, slot('apple'));
      drawPixelTextInRect(context, fonts, 'CHOOSE YOUR FARMER', {
        x: body.x, y: body.y + 42, width: body.width, height: 15,
      }, { font: 'header', align: 'center', color: '#4d2e22', overflow: 'ellipsis' });
      const list = drawMigrationInset({ x: body.x + 28, y: body.y + 64, width: body.width - 56, height: 126 });
      drawMigrationListRows(list, ['TOBY · ORCHARD HOMESTEAD', 'MIRA · NEW CHARACTER', '+ CREATE ANOTHER FARMER'], 0);
      drawMigrationButtonRow({ x: body.x + 80, y: body.y + body.height - 30, width: body.width - 160, height: 24 }, [
        { label: 'ENTER WORLD', tone: 'green', glyph: 'play' },
      ]);
      break;
    }
    case 'character-name': {
      const body = drawMigrationWindow(frame, 'WELCOME, FARMER', false);
      drawPixelTextInRect(context, fonts, 'WHAT SHOULD THE VALLEY CALL YOU?', {
        x: body.x + 20, y: body.y + 18, width: body.width - 40, height: 16,
      }, { font: 'header', align: 'center', color: '#4d2e22', overflow: 'ellipsis' });
      const input = { x: body.x + 74, y: body.y + 64, width: body.width - 148, height: 36 };
      drawUiFrame(context, skin, input, 'thin');
      drawPixelTextInRect(context, fonts, 'TOBY|', uiFrameContentRect(input, 'thin', 4), {
        color: '#51351f', verticalAlign: 'center', overflow: 'clip',
      });
      drawPixelTextInRect(context, fonts, '2–20 LETTERS · DISPLAY NAME CAN CHANGE LATER', {
        x: body.x + 30, y: body.y + 114, width: body.width - 60, height: 12,
      }, { align: 'center', color: '#8b5a3c', overflow: 'ellipsis' });
      drawMigrationButtonRow({ x: body.x + 72, y: body.y + body.height - 38, width: body.width - 144, height: 26 }, [
        { label: 'BACK' }, { label: 'CREATE', tone: 'green' },
      ]);
      break;
    }
    case 'update-ready': {
      const body = drawMigrationWindow(frame, 'UPDATE READY', false);
      drawPixelTextInRect(context, fonts, 'A NEW ORCHARD VERSION IS READY.', {
        x: body.x + 30, y: body.y + 30, width: body.width - 60, height: 16,
      }, { font: 'header', align: 'center', color: '#4d2e22', overflow: 'ellipsis' });
      drawPixelTextInRect(context, fonts, 'REFRESH NOW, OR CONTINUE SAFELY IN THIS LIVE MMO SESSION.', {
        x: body.x + 52, y: body.y + 62, width: body.width - 104, height: 30,
      }, { align: 'center', verticalAlign: 'center', color: '#6b4428', overflow: 'ellipsis' });
      drawProgressBar(context, { x: body.x + 86, y: body.y + 112, width: body.width - 172, height: 10 }, 1, GREEN_PROGRESS_PALETTE);
      drawMigrationButtonRow({ x: body.x + 54, y: body.y + body.height - 42, width: body.width - 108, height: 28 }, [
        { label: 'CONTINUE', tone: 'peach' }, { label: 'REFRESH NOW', tone: 'green', glyph: 'return' },
      ]);
      break;
    }
    case 'zone-minimap': {
      const body = drawMigrationWindow(frame, 'APPLE ORCHARD · SUMMER 12', false, 'parchment');
      const map = drawMigrationInset({ x: body.x, y: body.y + 8, width: Math.floor(body.width * 0.58), height: body.height - 16 }, 'MINIMAP · 2X');
      context.fillStyle = '#8fcf69';
      context.fillRect(map.x, map.y, map.width, map.height);
      const tile = 14;
      for (let y = map.y; y < map.y + map.height; y += tile) {
        for (let x = map.x; x < map.x + map.width; x += tile) {
          if ((Math.floor(x / tile) + Math.floor(y / tile)) % 5 !== 0) continue;
          context.fillStyle = '#5c9b45';
          context.fillRect(x, y, Math.min(tile, map.x + map.width - x), Math.min(tile, map.y + map.height - y));
        }
      }
      context.fillStyle = '#fff2d0';
      context.fillRect(map.x + Math.round(map.width * 0.58), map.y + Math.round(map.height * 0.48), 5, 5);
      const infoX = body.x + Math.floor(body.width * 0.62);
      drawPixelTextInRect(context, fonts, '09:40', { x: infoX, y: body.y + 22, width: body.x + body.width - infoX, height: 16 }, {
        font: 'header', align: 'center', color: '#4d2e22', overflow: 'ellipsis',
      });
      drawPixelTextInRect(context, fonts, 'CLEAR · LIGHT BREEZE\nWAXING CRESCENT\nORCHARD 42, 18', {
        x: infoX, y: body.y + 56, width: body.x + body.width - infoX, height: 70,
      }, { align: 'center', verticalAlign: 'center', color: '#6b4428', overflow: 'ellipsis' });
      drawMigrationButtonRow({ x: infoX + 12, y: body.y + body.height - 42, width: body.x + body.width - infoX - 24, height: 26 }, [
        { label: '−', tone: 'silver' }, { label: '+', tone: 'silver' },
      ]);
      break;
    }
    case 'hotbar-vitals': {
      const body = drawMigrationWindow(frame, 'PLAYER HUD', false, 'parchment');
      const bars = [
        ['HEALTH', 0.78, RED_PROGRESS_PALETTE],
        ['VIGOUR', 0.91, GREEN_PROGRESS_PALETTE],
        ['MANA', 0.46, undefined],
      ] as const;
      bars.forEach(([name, value, palette], index) => {
        const y = body.y + 12 + index * 28;
        drawPixelTextInRect(context, fonts, name, { x: body.x + 8, y, width: 72, height: 10 }, { color: '#6b4428', overflow: 'ellipsis' });
        drawProgressBar(context, { x: body.x + 82, y: y + 1, width: body.width - 170, height: 9 }, value, palette);
        drawPixelTextInRect(context, fonts, `${Math.round(value * 100)}%`, { x: body.x + body.width - 78, y, width: 68, height: 10 }, { align: 'right', color: '#51351f' });
      });
      const hotbar = [slot('axe'), slot('pickaxe'), slot('torch', 8), slot('apple', 12), null, slot('wood', 40), null, slot('lantern'), slot('stone', 99)];
      drawMigrationSlotGrid(
        { x: body.x + 12, y: body.y + 110, width: body.width - 24, height: 52 },
        9,
        hotbar,
        42,
        { horizontalAlign: 'center' },
      );
      drawPixelTextInRect(context, fonts, 'HUNGER 82                 1G 24S 08C', {
        x: body.x + 14, y: body.y + 178, width: body.width - 28, height: 12,
      }, { color: '#6b4428', overflow: 'ellipsis' });
      break;
    }
    case 'target-effects': {
      const body = drawMigrationWindow(frame, 'TARGET & EFFECTS', false, 'parchment');
      const target = drawMigrationInset({ x: body.x + 8, y: body.y + 12, width: body.width - 16, height: 92 }, 'MARLOW · FRIENDLY');
      drawMigrationIcon('heart', { x: target.x + 6, y: target.y + 4, width: 28, height: 28 }, 2);
      drawProgressBar(context, { x: target.x + 42, y: target.y + 11, width: target.width - 54, height: 10 }, 0.64, RED_PROGRESS_PALETTE);
      drawPixelTextInRect(context, fonts, '64 / 100', { x: target.x + 42, y: target.y + 29, width: target.width - 54, height: 10 }, { align: 'center', color: '#6b4428' });
      const cards = layoutUiFlex({ x: body.x + 8, y: body.y + 122, width: body.width - 16, height: 96 }, [
        { minSize: { width: 60, height: 96 }, grow: 1 }, { minSize: { width: 60, height: 96 }, grow: 1 },
      ], { gap: 10 });
      cards.forEach((card, index) => {
        const inner = drawMigrationInset(card);
        drawMigrationIcon(index === 0 ? 'star' : 'lightning', { x: inner.x + Math.round((inner.width - 30) / 2), y: inner.y + 7, width: 30, height: 30 }, index + 1);
        drawPixelTextInRect(context, fonts, index === 0 ? 'WELL RESTED · 08:42' : 'WINDED · 00:06', {
          x: inner.x + 4, y: inner.y + 48, width: inner.width - 8, height: 12,
        }, { align: 'center', color: '#6b4428', overflow: 'ellipsis' });
      });
      break;
    }
    case 'chat': {
      const body = drawMigrationWindow(frame, 'CHAT · LOCAL', false, 'parchment');
      drawMigrationTabs({ x: body.x, y: body.y + 5, width: body.width, height: 24 }, ['LOCAL', 'GLOBAL', 'PARTY', 'WHISPER'], 0);
      const history = drawMigrationInset({ x: body.x, y: body.y + 36, width: body.width, height: body.height - 84 });
      drawUiRichText(context, fonts, layoutUiRichText(fonts, parseUiRichText(
        '[[player:farmer-mira|Mira]]: The orchard gate is open.\nYou: Meet at [[coord:orchard,42,18|42, 18]]?\nSystem: [[item:apple|Apple]] was added to your pack.',
      ), history, { lineHeight: 13, maxLines: 6, linkColor: '#216b91' }));
      const input = { x: body.x, y: body.y + body.height - 39, width: body.width, height: 34 };
      drawUiFrame(context, skin, input, 'thin');
      drawPixelTextInRect(context, fonts, 'MESSAGE LOCAL…', uiFrameContentRect(input, 'thin', 4), { color: '#986846', verticalAlign: 'center', overflow: 'ellipsis' });
      break;
    }
    case 'quest-tracker': {
      const body = drawMigrationWindow(frame, 'TRACKED QUESTS', false, 'parchment');
      const quests = [
        ['FIRST HARVEST', 'APPLES 7 / 12', 7 / 12],
        ['A LIGHT BELOW', 'PLACE A LANTERN', 0.5],
        ['NEIGHBOURLY TRADE', 'SPEAK WITH MIRA', 0.15],
      ] as const;
      quests.forEach(([title, objective, progress], index) => {
        const y = body.y + 12 + index * 66;
        drawPixelTextInRect(context, fonts, title, { x: body.x + 8, y, width: body.width - 16, height: 12 }, { font: 'header', color: '#4d2e22', overflow: 'ellipsis' });
        drawPixelTextInRect(context, fonts, objective, { x: body.x + 14, y: y + 21, width: body.width - 28, height: 10 }, { color: '#6b4428', overflow: 'ellipsis' });
        drawProgressBar(context, { x: body.x + 14, y: y + 39, width: body.width - 28, height: 8 }, progress);
      });
      break;
    }
    case 'online-players': {
      const body = drawMigrationWindow(frame, 'ONLINE PLAYERS · 5', closable);
      const list = drawMigrationInset({ x: body.x, y: body.y + 4, width: body.width, height: body.height - 42 });
      ['● TOBY · ORCHARD', '● MIRA · MARKET', '● ROWAN · CELLAR', '● WREN · HOMESTEAD', '○ ELI · AWAY'].forEach((name, index) => {
        drawPixelTextInRect(context, fonts, name, {
          x: list.x + 8, y: list.y + index * 32, width: list.width - 16, height: 24,
        }, { color: index === 4 ? '#986846' : '#2d6f3b', verticalAlign: 'center', overflow: 'ellipsis' });
      });
      drawPixelTextInRect(context, fonts, 'CLICK A PLAYER TO WHISPER OR INSPECT', {
        x: body.x, y: body.y + body.height - 25, width: body.width, height: 10,
      }, { align: 'center', color: '#8b5a3c', overflow: 'ellipsis' });
      break;
    }
    case 'feedback-overlays': {
      drawPixelTextInRect(context, fonts, 'WORLD NAMEPLATES', { x: frame.x, y: frame.y + 4, width: frame.width, height: 12 }, { font: 'header', align: 'center', color: '#4d2e22' });
      ['TOBY', 'MIRA · SHOP', 'MARLOW !'].forEach((name, index) => {
        const rect = { x: frame.x + 54 + index * Math.floor((frame.width - 108) / 3), y: frame.y + 35, width: Math.floor((frame.width - 132) / 3), height: 24 };
        drawUiLabelPlate(context, skin, rect);
        drawPixelTextInRect(context, fonts, name, insetRect(rect, { left: 5, right: 5 }), { align: 'center', verticalAlign: 'center', color: '#51351f', overflow: 'ellipsis' });
      });
      const tooltip = { x: frame.x + 66, y: frame.y + 92, width: frame.width - 132, height: 42 };
      drawUiLabelPlate(context, skin, tooltip);
      drawPixelTextInRect(context, fonts, 'APPLE · FOOD · CLICK TO INSPECT', insetRect(tooltip, { left: 8, right: 8 }), { align: 'center', verticalAlign: 'center', color: '#51351f', overflow: 'ellipsis' });
      const toasts: readonly (readonly [string, MigrationButtonTone])[] = [
        ['QUEST UPDATED · FIRST HARVEST', 'green'],
        ['INVENTORY FULL · ITEM LEFT ON GROUND', 'red'],
        ['WELCOME TO APPLE ORCHARD', 'blue'],
      ];
      toasts.forEach(([message, tone], index) => {
        const rect = { x: frame.x + 38, y: frame.y + 150 + index * 37, width: frame.width - 76, height: 29 };
        drawFantasyButton(context, skin, fonts, rect, { tone, shape: 'pill', label: message });
      });
      break;
    }
    case 'touch-controls': {
      const body = drawMigrationWindow(frame, 'TOUCH CONTROLS', false, 'parchment');
      const pad = { x: body.x + 38, y: body.y + 62, width: 116, height: 116 };
      context.fillStyle = '#51351f24';
      context.beginPath();
      context.arc(pad.x + 58, pad.y + 58, 54, 0, Math.PI * 2);
      context.fill();
      drawFantasyButton(context, skin, fonts, { x: pad.x + 38, y: pad.y + 38, width: 40, height: 40 }, { tone: 'silver', shape: 'pill', size: 'small', glyph: 'up' });
      const actions = [
        { glyph: 'key_e' as const, tone: 'green' as const, x: body.x + body.width - 166, y: body.y + 54 },
        { glyph: 'wrench' as const, tone: 'peach' as const, x: body.x + body.width - 100, y: body.y + 112 },
        { glyph: 'up_1' as const, tone: 'blue' as const, x: body.x + body.width - 212, y: body.y + 132 },
        { glyph: 'pause' as const, tone: 'red' as const, x: body.x + body.width - 88, y: body.y + 28 },
      ];
      actions.forEach((action) => drawFantasyButton(context, skin, fonts, { x: action.x, y: action.y, width: 50, height: 50 }, {
        tone: action.tone, shape: 'square', size: 'small', glyph: action.glyph,
      }));
      drawPixelTextInRect(context, fonts, 'MOVE', { x: pad.x, y: pad.y + 122, width: pad.width, height: 10 }, { align: 'center', color: '#6b4428' });
      drawPixelTextInRect(context, fonts, 'INTERACT · TOOL · SPRINT · MENU', { x: body.x + body.width - 276, y: body.y + 214, width: 250, height: 10 }, { align: 'center', color: '#6b4428', overflow: 'ellipsis' });
      break;
    }
    case 'inventory': {
      const body = drawMigrationWindow(frame, 'INVENTORY', closable);
      const hotbarHeight = 78;
      const mainHeight = body.height - hotbarHeight - 8;
      const equipmentWidth = 226;
      drawMigrationSlotSection({
        x: body.x + 8,
        y: body.y + 4,
        width: equipmentWidth,
        height: mainHeight,
      }, 'EQUIPMENT', 3, [
        slot('helm'), null, slot('ring'),
        slot('axe'), slot('tunic'), null,
        null, null, null,
      ], 52);
      drawMigrationVerticalDivider(body.x + equipmentWidth + 24, body.y + 4, mainHeight - 4);
      const packX = body.x + equipmentWidth + 42;
      const filter = { x: packX, y: body.y + 2, width: body.x + body.width - packX - 8, height: 34 };
      drawUiFrame(context, skin, filter, 'thin');
      drawPixelTextInRect(context, fonts, 'FILTER ITEMS…', uiFrameContentRect(filter, 'thin', 4), {
        color: '#986846', verticalAlign: 'center', overflow: 'ellipsis',
      });
      drawMigrationIcon('backpack', { x: filter.x + filter.width - 27, y: filter.y + 4, width: 23, height: 23 }, 1);
      drawMigrationSlotSection({
        x: packX,
        y: body.y + 45,
        width: body.x + body.width - packX - 8,
        height: mainHeight - 45,
      }, 'BACKPACK · 7×3', 7, [
        slot('wood', 40), slot('apple', 12), slot('torch', 8), slot('lantern'), slot('stone', 99), slot('grape', 23), slot('backpack'),
        slot('orchard_tea', 2), null, null, null, null, null, null,
        null, slot('stone', 18), null, null, null, null, null,
      ], 48);
      drawMigrationHotbar({
        x: body.x,
        y: body.y + body.height - hotbarHeight,
        width: body.width,
        height: hotbarHeight,
      }, [slot('apple', 60), slot('axe'), slot('pickaxe'), slot('wood', 12), slot('torch', 8), slot('lantern'), null, null, slot('grape', 9), slot('stone', 44)]);
      break;
    }
    case 'crafting': {
      const body = drawMigrationWindow(frame, 'CRAFTING', closable);
      const hotbarHeight = 78;
      const mainY = body.y + 4;
      const mainHeight = body.height - hotbarHeight - 10;
      drawMigrationObjectPortrait({ x: body.x + 4, y: mainY, width: 112, height: 112 }, 'workbench', 'WORKBENCH');
      drawPixelTextInRect(context, fonts, '3×3 SHAPED RECIPES\n23 RECIPES KNOWN', {
        x: body.x + 4, y: mainY + 124, width: 112, height: 42,
      }, { align: 'center', verticalAlign: 'center', color: '#8b5a3c', overflow: 'ellipsis' });
      drawMigrationSlotSection({
        x: body.x + 132,
        y: mainY,
        width: 198,
        height: mainHeight,
      }, 'CRAFTING GRID', 3, [
        slot('wood'), slot('wood'), null,
        null, slot('wood'), null,
        null, null, null,
      ], 50);
      drawPixelTextInRect(context, fonts, '→', {
        x: body.x + 334, y: mainY + 88, width: 34, height: 30,
      }, { font: 'header', align: 'center', verticalAlign: 'center', color: '#6b4428' });
      drawMigrationSlotSection({
        x: body.x + 370,
        y: mainY + 52,
        width: 74,
        height: 104,
      }, 'RESULT', 1, [slot('plank', 4)], 56, {
        horizontalAlign: 'center',
        verticalAlign: 'center',
      });
      drawMigrationButtonRow({ x: body.x + 354, y: mainY + 170, width: 108, height: 28 }, [
        { label: 'CRAFT', tone: 'green', glyph: 'wrench' },
      ]);
      const recipes = drawMigrationInset({
        x: body.x + 474,
        y: mainY,
        width: 178,
        height: mainHeight,
      }, 'RECIPES');
      drawMigrationListRows(recipes, ['4 WOODEN PLANK', '4 STICK', '2 TORCH', '1 CAMPFIRE', '1 WORKBENCH', '1 CHEST', '1 BARREL'], 0);
      drawMigrationSlotSection({
        x: body.x + 670,
        y: mainY,
        width: body.width - 674,
        height: mainHeight,
      }, 'INVENTORY · 5×3', 5, [
        slot('apple', 9), slot('grape', 6), slot('wood', 18), slot('torch', 5), slot('stone', 8),
        slot('axe'), slot('pickaxe'), slot('backpack'), null, null,
        null, null, slot('orchard_tea', 2), null, null,
      ], 46);
      drawMigrationHotbar({
        x: body.x,
        y: body.y + body.height - hotbarHeight,
        width: body.width,
        height: hotbarHeight,
      }, [slot('apple', 60), slot('axe'), slot('pickaxe'), slot('wood', 12), slot('torch', 8), slot('lantern'), null, null, slot('grape', 9), slot('stone', 44)]);
      break;
    }
    case 'chest': {
      const body = drawMigrationWindow(frame, 'CHEST', closable);
      const hotbarHeight = 76;
      const mainHeight = body.height - hotbarHeight - 8;
      drawMigrationObjectPortrait({ x: body.x + 4, y: body.y + 4, width: 132, height: 120 }, 'chest', 'OAK CHEST', 'chest');
      drawPixelTextInRect(context, fonts, '8 SLOTS\nSHARED ACCESS', {
        x: body.x + 4, y: body.y + 133, width: 132, height: 35,
      }, { align: 'center', verticalAlign: 'center', color: '#8b5a3c', overflow: 'ellipsis' });
      drawMigrationSlotSection({
        x: body.x + 154,
        y: body.y + 4,
        width: body.width - 158,
        height: 124,
      }, 'CHEST · 4×2', 4, [slot('wood', 90), slot('apple', 30), null, null, slot('stone', 20), null, slot('grape', 8), null], 48);
      drawMigrationSlotSection({
        x: body.x + 154,
        y: body.y + 138,
        width: body.width - 158,
        height: mainHeight - 138,
      }, 'BACKPACK · 7×2', 7, [
        slot('axe'), slot('torch', 8), slot('apple', 12), slot('lantern'), slot('wood', 40), slot('stone', 12), slot('backpack'),
        null, null, null, slot('orchard_tea', 2), null, null, null,
      ], 42);
      drawMigrationHotbar({ x: body.x, y: body.y + body.height - hotbarHeight, width: body.width, height: hotbarHeight }, [
        slot('apple', 60), slot('axe'), slot('pickaxe'), slot('wood', 12), slot('torch', 8), slot('lantern'), null, null, slot('grape', 9), slot('stone', 44),
      ]);
      break;
    }
    case 'barrel': {
      const body = drawMigrationWindow(frame, 'BARREL', closable);
      drawMigrationObjectPortrait({ x: body.x + 4, y: body.y + 6, width: 124, height: 132 }, 'barrel', 'OAK BARREL', 'closed');
      drawMigrationSlotSection({
        x: body.x + 146,
        y: body.y + 6,
        width: body.width - 150,
        height: 132,
      }, 'STORAGE · 4×2', 4, [slot('apple', 32), slot('grape', 18), null, null, slot('wood', 10), null, null, null], 44);
      drawPixelTextInRect(context, fonts, 'CURING BEGINS WHEN THE LID IS SEALED.', {
        x: body.x + 24, y: body.y + 154, width: body.width - 48, height: 14,
      }, { align: 'center', color: '#6b4428', overflow: 'ellipsis' });
      drawMigrationButtonRow({ x: body.x + 92, y: body.y + body.height - 34, width: body.width - 184, height: 28 }, [{ label: 'SEAL BARREL', tone: 'gold', glyph: 'key_e' }]);
      break;
    }
    case 'furnace': {
      const body = drawMigrationWindow(frame, 'FURNACE', closable);
      const hotbarHeight = 76;
      const mainHeight = body.height - hotbarHeight - 8;
      drawMigrationObjectPortrait({ x: body.x + 4, y: body.y + 4, width: 138, height: 138 }, 'furnace', 'STONE FURNACE', 'off');
      drawPixelTextInRect(context, fonts, 'ACTIVE · 6.2S\n2 FUEL REMAINS', {
        x: body.x + 4, y: body.y + 150, width: 138, height: 34,
      }, { align: 'center', verticalAlign: 'center', color: '#8b5a3c', overflow: 'ellipsis' });
      const processX = body.x + 164;
      // Furnace inventory is five independent dense groups: input, fuel,
      // output, player inventory, and the bottom hotbar.
      drawMigrationSlotSection({ x: processX, y: body.y + 4, width: 82, height: 104 }, 'ORE', 1, [slot('iron_ore', 8)], 54, {
        horizontalAlign: 'center',
        verticalAlign: 'center',
      });
      drawMigrationSlotSection({ x: processX, y: body.y + 116, width: 82, height: 104 }, 'FUEL', 1, [slot('wood', 12)], 54, {
        horizontalAlign: 'center',
        verticalAlign: 'center',
      });
      drawPixelTextInRect(context, fonts, '→', {
        x: processX + 90, y: body.y + 80, width: 42, height: 44,
      }, { font: 'header', align: 'center', verticalAlign: 'center', color: '#6b4428' });
      drawMigrationSlotSection({ x: processX + 138, y: body.y + 64, width: 86, height: 112 }, 'OUTPUT', 1, [slot('iron_bar', 2)], 58, {
        horizontalAlign: 'center',
        verticalAlign: 'center',
      });
      drawProgressBar(context, { x: processX, y: body.y + 232, width: 224, height: 12 }, 0.62, GREEN_PROGRESS_PALETTE);
      drawPixelTextInRect(context, fonts, 'SMELTING · 62%', {
        x: processX, y: body.y + 250, width: 224, height: 11,
      }, { align: 'center', color: '#6b4428', overflow: 'ellipsis' });
      const packX = processX + 250;
      drawMigrationSlotSection({
        x: packX,
        y: body.y + 4,
        width: body.x + body.width - packX - 6,
        height: mainHeight,
      }, 'BACKPACK · 6×3', 6, [
        slot('apple', 9), slot('grape', 6), slot('wood', 18), slot('torch', 5), slot('stone', 8), slot('iron_ore', 12),
        slot('axe'), slot('pickaxe'), slot('backpack'), null, null, null,
        null, null, slot('orchard_tea', 2), null, null, null,
      ], 46);
      drawMigrationHotbar({ x: body.x, y: body.y + body.height - hotbarHeight, width: body.width, height: hotbarHeight }, [
        slot('apple', 60), slot('axe'), slot('pickaxe'), slot('wood', 12), slot('torch', 8), slot('lantern'), null, null, slot('grape', 9), slot('stone', 44),
      ]);
      break;
    }
    case 'cooking': {
      const body = drawMigrationWindow(frame, 'COOKING FIRE', closable);
      const hotbarHeight = 76;
      const mainHeight = body.height - hotbarHeight - 8;
      drawMigrationObjectPortrait({ x: body.x + 4, y: body.y + 4, width: 138, height: 138 }, 'cooking_fire', 'COOKING FIRE', 'burn', 1);
      drawPixelTextInRect(context, fonts, 'LIT · OAK FUEL\n4.4S REMAINING', {
        x: body.x + 4, y: body.y + 150, width: 138, height: 34,
      }, { align: 'center', verticalAlign: 'center', color: '#8b5a3c', overflow: 'ellipsis' });
      const processX = body.x + 166;
      drawMigrationSlotSection({ x: processX, y: body.y + 10, width: 86, height: 108 }, 'RAW', 1, [slot('apple', 3)], 56, {
        horizontalAlign: 'center',
        verticalAlign: 'center',
      });
      drawPixelTextInRect(context, fonts, '↓', {
        x: processX + 20, y: body.y + 119, width: 46, height: 28,
      }, { font: 'header', align: 'center', color: '#6b4428' });
      drawMigrationSlotSection({ x: processX, y: body.y + 146, width: 86, height: 108 }, 'COOKED', 1, [slot('orchard_tea')], 56, {
        horizontalAlign: 'center',
        verticalAlign: 'center',
      });
      const meter = { x: processX + 104, y: body.y + 32, width: 18, height: 190 };
      drawUiFrame(context, skin, meter, 'thin');
      const meterContent = uiFrameContentRect(meter, 'thin', 2);
      context.fillStyle = '#3f2832';
      context.fillRect(meterContent.x, meterContent.y, meterContent.width, meterContent.height);
      const fillHeight = Math.round(meterContent.height * 0.44);
      context.fillStyle = '#e3a84b';
      context.fillRect(meterContent.x, meterContent.y + meterContent.height - fillHeight, meterContent.width, fillHeight);
      drawPixelTextInRect(context, fonts, '44%', {
        x: processX + 88, y: body.y + 232, width: 50, height: 11,
      }, { align: 'center', color: '#6b4428' });
      const packX = processX + 154;
      drawMigrationSlotSection({
        x: packX,
        y: body.y + 4,
        width: body.x + body.width - packX - 6,
        height: mainHeight,
      }, 'BACKPACK · FOOD & FUEL', 6, [
        slot('apple', 9), slot('grape', 6), slot('wood', 18), slot('torch', 5), slot('stone', 8), slot('orchard_tea', 2),
        slot('axe'), slot('pickaxe'), slot('backpack'), null, null, null,
        null, null, null, null, null, null,
      ], 46);
      drawMigrationHotbar({ x: body.x, y: body.y + body.height - hotbarHeight, width: body.width, height: hotbarHeight }, [
        slot('apple', 60), slot('axe'), slot('pickaxe'), slot('wood', 12), slot('torch', 8), slot('lantern'), null, null, slot('grape', 9), slot('stone', 44),
      ]);
      break;
    }
    case 'character': {
      const body = drawMigrationWindow(frame, 'CHARACTER', closable);
      const splitX = body.x + 442;
      drawPixelTextInRect(context, fonts, 'DASTARI', {
        x: body.x + 8, y: body.y + 6, width: 418, height: 18,
      }, { font: 'header', color: '#4d2e22', overflow: 'ellipsis' });
      drawMigrationSlotSection({
        x: body.x + 8,
        y: body.y + 32,
        width: 190,
        height: 210,
      }, 'EQUIPMENT · 3×3', 3, [
        slot('helm'), null, slot('ring'),
        slot('axe'), slot('tunic'), null,
        null, null, null,
      ], 52);
      const portrait = { x: body.x + 222, y: body.y + 38, width: 182, height: 202 };
      const portraitContent = drawMigrationInset(portrait, 'FARMER');
      context.fillStyle = '#d9a44126';
      context.fillRect(portraitContent.x, portraitContent.y, portraitContent.width, portraitContent.height);
      drawMigrationFarmerPortrait(portraitContent);
      const appearanceRows = [
        ['HAIR', 'BLONDE'], ['CHEST', 'GREEN'], ['LEGS', 'BLACK'], ['BOOTS', 'BLUE'],
      ] as const;
      appearanceRows.forEach(([labelText, value], index) => {
        const y = body.y + 260 + index * 31;
        drawFantasyButton(context, skin, fonts, { x: body.x + 22, y, width: 34, height: 24 }, { tone: 'peach', shape: 'square', size: 'small', glyph: 'left_1' });
        drawPixelTextInRect(context, fonts, `${labelText}  ${value}`, {
          x: body.x + 68, y, width: 274, height: 24,
        }, { align: 'center', verticalAlign: 'center', color: '#51351f', overflow: 'ellipsis' });
        drawFantasyButton(context, skin, fonts, { x: body.x + 354, y, width: 34, height: 24 }, { tone: 'peach', shape: 'square', size: 'small', label: '>' });
      });
      drawMigrationVerticalDivider(splitX, body.y + 4, body.height - 8);
      const rightX = splitX + 24;
      const rightWidth = body.x + body.width - rightX - 8;
      drawPixelTextInRect(context, fonts, 'RESOURCES', {
        x: rightX, y: body.y + 6, width: rightWidth, height: 18,
      }, { font: 'header', color: '#4d2e22', overflow: 'ellipsis' });
      const resources = [
        ['HEALTH', 1, RED_PROGRESS_PALETTE],
        ['MANA', 1, undefined],
        ['VIGOUR', 1, GREEN_PROGRESS_PALETTE],
      ] as const;
      resources.forEach(([name, value, palette], index) => {
        const y = body.y + 38 + index * 31;
        drawPixelTextInRect(context, fonts, name, { x: rightX, y, width: 84, height: 12 }, { color: '#6b4428' });
        drawProgressBar(context, { x: rightX + 92, y: y + 1, width: rightWidth - 180, height: 10 }, value, palette);
        drawPixelTextInRect(context, fonts, '100 / 100', { x: rightX + rightWidth - 80, y, width: 80, height: 12 }, { align: 'right', color: '#51351f' });
      });
      drawPixelTextInRect(context, fonts, 'ATTRIBUTES', {
        x: rightX, y: body.y + 142, width: rightWidth, height: 18,
      }, { font: 'header', color: '#4d2e22' });
      drawMigrationListRows({ x: rightX, y: body.y + 172, width: rightWidth, height: 142 }, [
        'STRENGTH                         10',
        'DEXTERITY                        10',
        'CONSTITUTION                     10',
        'INTELLIGENCE                     10',
        'WISDOM                           10',
        'CHARISMA                         10',
      ]);
      drawPixelTextInRect(context, fonts, 'EXPERIENCE', {
        x: rightX, y: body.y + 326, width: rightWidth, height: 18,
      }, { font: 'header', color: '#4d2e22' });
      drawPixelTextInRect(context, fonts, 'EXPLORER · LEVEL 3', {
        x: rightX, y: body.y + 352, width: 150, height: 12,
      }, { color: '#51351f' });
      drawProgressBar(context, { x: rightX + 166, y: body.y + 352, width: rightWidth - 246, height: 10 }, 0.66, GREEN_PROGRESS_PALETTE);
      drawPixelTextInRect(context, fonts, '700 / 1055 XP', {
        x: rightX + rightWidth - 76, y: body.y + 352, width: 76, height: 12,
      }, { align: 'right', color: '#6b4428' });
      break;
    }
    case 'skills': {
      const body = drawMigrationWindow(frame, 'SKILLS · 3 POINTS', closable);
      drawMigrationTabs({ x: body.x, y: body.y + 4, width: body.width - 280, height: 28 }, ['COMBAT', 'EXPLORER', 'FARMING'], 1);
      drawPixelTextInRect(context, fonts, 'LEVEL 3 · 3 UNSPENT POINTS', {
        x: body.x + body.width - 266, y: body.y + 4, width: 258, height: 28,
      }, { font: 'header', align: 'right', verticalAlign: 'center', color: '#4d2e22', overflow: 'ellipsis' });
      drawProgressBar(context, { x: body.x, y: body.y + 39, width: body.width, height: 10 }, 53 / 408, GREEN_PROGRESS_PALETTE);
      const detailWidth = 280;
      const tree = drawMigrationInset({
        x: body.x,
        y: body.y + 58,
        width: body.width - detailWidth - 16,
        height: body.height - 62,
      }, 'EXPLORER TREE · DRAG TO PAN');
      context.strokeStyle = '#8b5a3c';
      context.lineWidth = 3;
      [[0.15, 0.22, 0.38, 0.45], [0.78, 0.2, 0.58, 0.45], [0.38, 0.45, 0.58, 0.45], [0.38, 0.45, 0.25, 0.76], [0.58, 0.45, 0.72, 0.76]].forEach(([x1, y1, x2, y2]) => {
        context.beginPath(); context.moveTo(tree.x + tree.width * x1!, tree.y + tree.height * y1!); context.lineTo(tree.x + tree.width * x2!, tree.y + tree.height * y2!); context.stroke();
      });
      const nodes = [[0.15, 0.15], [0.78, 0.13], [0.38, 0.38], [0.58, 0.38], [0.25, 0.69], [0.72, 0.69]] as const;
      nodes.forEach(([px, py], index) => drawFantasyButton(context, skin, fonts, {
        x: tree.x + tree.width * px - 25, y: tree.y + tree.height * py - 25, width: 50, height: 50,
      }, { tone: index < 4 ? 'green' : 'silver', shape: 'square', size: 'small', glyph: index === 3 ? 'star' : 'up' }));
      const detail = drawMigrationInset({
        x: body.x + body.width - detailWidth,
        y: body.y + 58,
        width: detailWidth,
        height: body.height - 62,
      }, 'ORCHARD WAYFINDER');
      drawMigrationIcon('star', { x: detail.x + Math.round((detail.width - 50) / 2), y: detail.y + 10, width: 50, height: 50 }, 2);
      drawUiRichText(context, fonts, layoutUiRichText(fonts, parseUiRichText(
        'Reveal nearby [[coord:orchard,42,18|orchard landmarks]] and gain +10% movement speed on known paths.',
      ), { x: detail.x + 10, y: detail.y + 74, width: detail.width - 20, height: 82 }, {
        lineHeight: 13, maxLines: 6, linkColor: '#216b91',
      }));
      drawPixelTextInRect(context, fonts, 'REQUIRES · PATHFINDER 1/3\nCOST · 1 SKILL POINT', {
        x: detail.x + 10, y: detail.y + 170, width: detail.width - 20, height: 38,
      }, { align: 'center', verticalAlign: 'center', color: '#8b5a3c', overflow: 'ellipsis' });
      drawMigrationButtonRow({ x: detail.x + 18, y: detail.y + detail.height - 68, width: detail.width - 36, height: 27 }, [
        { label: 'RESET TREE', tone: 'red', glyph: 'return' },
      ]);
      drawMigrationButtonRow({ x: detail.x + 18, y: detail.y + detail.height - 34, width: detail.width - 36, height: 27 }, [
        { label: 'LEARN 1 RANK', tone: 'green', glyph: 'star' },
      ]);
      break;
    }
    case 'quest-log': {
      const body = drawMigrationWindow(frame, 'QUEST LOG', closable);
      const master = drawMigrationInset({ x: body.x, y: body.y + 4, width: Math.floor(body.width * 0.35), height: body.height - 8 }, 'QUESTS');
      drawMigrationListRows(master, ['FIRST HARVEST', 'A LIGHT BELOW', 'CELLAR TOUR', 'LOST LETTER', 'NEIGHBOURLY TRADE'], 0);
      const detail = drawMigrationInset({ x: body.x + Math.floor(body.width * 0.37), y: body.y + 4, width: Math.floor(body.width * 0.63), height: body.height - 8 }, 'FIRST HARVEST');
      drawUiRichText(context, fonts, layoutUiRichText(fonts, parseUiRichText('Collect [[item:apple|12 apples]] and return to [[player:marlow|Marlow]] near [[coord:orchard,42,18|the old gate]].'), {
        x: detail.x + 6, y: detail.y + 7, width: detail.width - 12, height: 70,
      }, { lineHeight: 12, maxLines: 5, linkColor: '#216b91' }));
      drawProgressBar(context, { x: detail.x + 8, y: detail.y + 88, width: detail.width - 16, height: 9 }, 7 / 12);
      drawPixelTextInRect(context, fonts, 'OBJECTIVES', {
        x: detail.x + 8, y: detail.y + 112, width: detail.width - 16, height: 14,
      }, { font: 'header', color: '#4d2e22' });
      drawMigrationListRows({ x: detail.x + 8, y: detail.y + 136, width: detail.width - 16, height: 72 }, [
        '✓ SPEAK WITH MARLOW',
        '• HARVEST APPLES          7 / 12',
        '○ RETURN TO THE OLD GATE',
      ]);
      drawPixelTextInRect(context, fonts, 'REWARDS · 120 XP · 35C · ORCHARD TEA', {
        x: detail.x + 8, y: detail.y + 220, width: detail.width - 16, height: 13,
      }, { align: 'center', color: '#8b5a3c', overflow: 'ellipsis' });
      drawMigrationButtonRow({ x: detail.x + 8, y: detail.y + detail.height - 34, width: detail.width - 16, height: 26 }, [
        { label: 'TRACK', tone: 'green' }, { label: 'DROP', tone: 'red' },
      ]);
      break;
    }
    case 'help-book': {
      const book = { x: frame.x + 12, y: frame.y + 10, width: frame.width - 24, height: frame.height - 40 };
      drawMigrationWindow(book, 'FIELD GUIDE', closable, 'book');
      const [leftPage, rightPage] = uiBookPageRects(book, 2, 8);
      const left = insetRect(leftPage, { left: 4, top: 31, right: 8, bottom: 14 });
      const right = insetRect(rightPage, { left: 8, top: 31, right: 4, bottom: 14 });
      drawPixelTextInRect(context, fonts, 'GETTING STARTED', { x: left.x, y: left.y, width: left.width, height: 15 }, { font: 'header', color: '#4d2e22', overflow: 'ellipsis' });
      drawUiRichText(context, fonts, layoutUiRichText(fonts, parseUiRichText(
        'Use WASD to move. Open [[item:backpack|your pack]] and meet [[player:marlow|Marlow]].\n\nTODAY’S ROUTE\n1. Gather fallen [[item:apple|apples]].\n2. Craft wooden planks.\n3. Visit the old cellar gate.\n\nBlue text is inspectable and shareable in chat.',
      ), {
        x: left.x, y: left.y + 24, width: left.width, height: left.height - 24,
      }, { lineHeight: 13, maxLines: 18, linkColor: '#216b91' }));
      drawPixelTextInRect(context, fonts, 'ORCHARD LINKS', { x: right.x, y: right.y, width: right.width, height: 15 }, { font: 'header', color: '#4d2e22', overflow: 'ellipsis' });
      drawUiRichText(context, fonts, layoutUiRichText(fonts, parseUiRichText(
        'Jump to [[coord:orchard,42,18|42, 18]], inspect [[item:apple|an apple]], or open the next chapter.\n\nQUICK REFERENCE\n• I opens inventory\n• C opens crafting\n• N toggles nameplates\n• Enter focuses chat\n\nBookmarks jump directly to authored chapters without changing automatic page flow.',
      ), {
        x: right.x, y: right.y + 24, width: right.width, height: right.height - 24,
      }, { lineHeight: 13, maxLines: 18, linkColor: '#216b91' }));
      const kitY = left.y + left.height - 78;
      drawMigrationSlotSection({ x: left.x, y: kitY, width: left.width, height: 62 }, 'FIRST-DAY KIT', 3, [
        slot('apple', 3), slot('wood', 6), slot('torch', 2),
      ], 38, { horizontalAlign: 'center' });
      const nextChapter = drawMigrationInset({
        x: right.x,
        y: right.y + right.height - 78,
        width: right.width,
        height: 62,
      }, 'NEXT CHAPTER');
      drawPixelTextInRect(context, fonts, 'CRAFTING & PROCESSORS  →', nextChapter, {
        align: 'center', verticalAlign: 'center', color: '#6b4428', overflow: 'ellipsis',
      });
      drawPixelTextInRect(context, fonts, '1', { x: left.x, y: leftPage.y + leftPage.height - 12, width: 20, height: 9 }, { color: '#8b5a3c' });
      drawPixelTextInRect(context, fonts, '2', { x: right.x + right.width - 20, y: rightPage.y + rightPage.height - 12, width: 20, height: 9 }, { align: 'right', color: '#8b5a3c' });
      drawFantasyButton(context, skin, fonts, { x: book.x - 9, y: book.y + 78, width: 26, height: 54 }, { tone: 'green', shape: 'square', size: 'small', glyph: 'help' });
      break;
    }
    case 'npc-dialogue': {
      const body = drawMigrationWindow(frame, 'MARLOW', closable);
      const portrait = drawMigrationInset({ x: body.x, y: body.y + 4, width: 142, height: 164 }, 'ORCHARD KEEPER');
      context.fillStyle = '#d9a44155';
      context.fillRect(portrait.x + 18, portrait.y + 16, portrait.width - 36, portrait.height - 34);
      drawMigrationFarmerPortrait(insetRect(portrait, { left: 20, top: 14, right: 20, bottom: 18 }));
      const dialogue = drawMigrationInset({ x: body.x + 156, y: body.y + 4, width: body.width - 156, height: 164 });
      drawUiRichText(context, fonts, layoutUiRichText(fonts, parseUiRichText('The first apples are ready. Bring me [[item:apple|twelve apples]] and I will show you the old [[coord:orchard,42,18|cellar gate]].'), {
        x: dialogue.x + 8, y: dialogue.y + 8, width: dialogue.width - 16, height: dialogue.height - 16,
      }, { lineHeight: 13, maxLines: 9, linkColor: '#216b91' }));
      drawMigrationButtonRow({ x: body.x + 156, y: body.y + 182, width: body.width - 156, height: 28 }, [
        { label: 'I WILL HELP', tone: 'green' }, { label: 'MAYBE LATER' },
      ]);
      break;
    }
    case 'merchant-shop': {
      const body = drawMigrationWindow(frame, 'MARLOW’S SHOP', closable);
      const filter = { x: body.x, y: body.y + 4, width: Math.floor(body.width * 0.58), height: 30 };
      drawUiFrame(context, skin, filter, 'thin');
      drawPixelTextInRect(context, fonts, 'FILTER STOCK…', uiFrameContentRect(filter, 'thin', 3), { color: '#986846', verticalAlign: 'center', overflow: 'ellipsis' });
      drawPixelTextInRect(context, fonts, 'BALANCE  1G 24S 08C', { x: body.x + Math.floor(body.width * 0.61), y: body.y + 10, width: Math.floor(body.width * 0.39), height: 12 }, { align: 'right', color: '#6b4428', overflow: 'ellipsis' });
      const stock = drawMigrationInset({ x: body.x, y: body.y + 44, width: Math.floor(body.width * 0.62), height: body.height - 48 }, 'STOCK');
      const goods = [slot('apple'), slot('axe'), slot('torch', 4), slot('backpack'), slot('grape', 6), slot('orchard_tea')];
      const goodLabels = ['APPLE · 12C', 'IRON AXE · 8S 50C', 'TORCH ×4 · 45C', 'BACKPACK · 25S', 'GRAPES ×6 · 30C', 'ORCHARD TEA · 1S 20C'];
      const stockRowHeight = Math.max(30, Math.floor(stock.height / goods.length));
      goods.forEach((stack, index) => {
        const y = stock.y + index * stockRowHeight;
        const slotHeight = Math.max(25, Math.min(33, stockRowHeight - 2));
        mockSlot({ x: stock.x + 4, y, width: slotHeight - 3, height: slotHeight }, stack);
        drawPixelTextInRect(context, fonts, goodLabels[index]!, { x: stock.x + 44, y, width: stock.width - 48, height: slotHeight }, { verticalAlign: 'center', color: '#51351f', overflow: 'ellipsis' });
      });
      const basket = drawMigrationInset({ x: body.x + Math.floor(body.width * 0.65), y: body.y + 44, width: Math.floor(body.width * 0.35), height: body.height - 91 }, 'BASKET');
      drawMigrationSlotGrid(
        { x: basket.x, y: basket.y + 4, width: basket.width, height: 92 },
        3,
        [slot('apple', 4), slot('torch', 4), null],
        38,
        { horizontalAlign: 'center' },
      );
      drawPixelTextInRect(context, fonts, '2 LINES · 8 ITEMS\nTOTAL · 93C', {
        x: basket.x + 8, y: basket.y + 100, width: basket.width - 16, height: 34,
      }, { align: 'center', verticalAlign: 'center', color: '#6b4428', overflow: 'ellipsis' });
      drawMigrationButtonRow({ x: basket.x, y: body.y + body.height - 40, width: basket.width, height: 28 }, [{ label: 'BUY · 93C', tone: 'green', glyph: 'coin' }]);
      break;
    }
    case 'player-trade': {
      const body = drawMigrationWindow(frame, 'TRADE WITH MIRA', closable);
      const panes = layoutUiFlex({ x: body.x, y: body.y + 4, width: body.width, height: body.height - 54 }, [
        { minSize: { width: 160, height: 180 }, grow: 1 }, { minSize: { width: 160, height: 180 }, grow: 1 },
      ], { gap: 12 });
      panes.forEach((pane, index) => {
        const inner = drawMigrationInset(pane, index === 0 ? 'YOUR OFFER' : 'MIRA’S OFFER');
        drawMigrationSlotGrid({ x: inner.x, y: inner.y + 2, width: inner.width, height: 100 }, 4, index === 0
          ? [slot('apple', 8), slot('wood', 20), null, null, null, null, null, null]
          : [slot('orchard_tea', 2), slot('grape', 12), null, null, null, null, null, null], 40);
        drawPixelTextInRect(context, fonts, index === 0 ? 'COINS  2S 00C' : 'COINS  1S 25C', { x: inner.x + 4, y: inner.y + 114, width: inner.width - 8, height: 12 }, { align: 'center', color: '#6b4428', overflow: 'ellipsis' });
        drawFantasyButton(context, skin, fonts, { x: inner.x + 24, y: inner.y + inner.height - 33, width: inner.width - 48, height: 26 }, { tone: index === 0 ? 'green' : 'silver', label: index === 0 ? 'READY' : 'WAITING…', state: index === 0 ? 'pressed' : 'disabled' });
      });
      drawPixelTextInRect(context, fonts, 'OFFERS LOCK AND COMPLETE ATOMICALLY', { x: body.x, y: body.y + body.height - 28, width: body.width, height: 11 }, { align: 'center', color: '#8b5a3c', overflow: 'ellipsis' });
      break;
    }
    case 'game-menu': {
      const body = drawMigrationWindow(frame, 'GAME MENU · WORLD CONTINUES LIVE', closable);
      drawPixelTextInRect(context, fonts, 'THIS MMO DOES NOT PAUSE WHILE THE MENU IS OPEN.', { x: body.x + 24, y: body.y + 6, width: body.width - 48, height: 12 }, { align: 'center', color: '#8b5a3c', overflow: 'ellipsis' });
      const rows = [
        [{ label: 'RETURN TO GAME', tone: 'green' as const, glyph: 'return' as const }],
        [{ label: 'SETTINGS', tone: 'peach' as const, glyph: 'wrench' as const }],
        [{ label: 'HELP', tone: 'silver' as const, glyph: 'help' as const }, { label: 'DEVELOPER', tone: 'silver' as const, glyph: 'key_r' as const }],
        [{ label: 'FULLSCREEN', tone: 'peach' as const, disabled: true }, { label: 'SIGN OUT', tone: 'red' as const, glyph: 'power' as const }],
      ];
      rows.forEach((actions, index) => drawMigrationButtonRow({ x: body.x + 88, y: body.y + 35 + index * 48, width: body.width - 176, height: 31 }, actions));
      drawPixelTextInRect(context, fonts, 'FULLSCREEN UNAVAILABLE ON THIS DEVICE', { x: body.x + 120, y: body.y + body.height - 18, width: body.width - 240, height: 10 }, { align: 'center', color: '#986846', overflow: 'ellipsis' });
      break;
    }
    case 'settings': {
      const body = drawMigrationWindow(frame, 'SETTINGS', closable);
      drawMigrationTabs({ x: body.x, y: body.y + 4, width: body.width, height: 28 }, ['PLAY', 'CTRL', 'VIDEO', 'AUDIO', 'UI', 'A11Y'], 3);
      const panelY = body.y + 42;
      const audioWidth = Math.floor(body.width * 0.61);
      const audio = drawMigrationInset({ x: body.x, y: panelY, width: audioWidth, height: body.height - 46 }, 'AUDIO MIXER');
      const rows = [
        ['MASTER', migrationMasterSlider, 'sound', 2],
        ['MUSIC', migrationMusicSlider, 'music', 2],
        ['SOUNDS', migrationSoundSlider, 'sound', 0],
      ] as const;
      rows.forEach(([name, control, icon, level], index) => {
        const y = audio.y + 10 + index * 51;
        drawMigrationIcon(icon, { x: audio.x + 5, y: y - 4, width: 32, height: 32 }, level);
        drawPixelTextInRect(context, fonts, name, { x: audio.x + 42, y, width: 72, height: 20 }, { verticalAlign: 'center', color: '#51351f', overflow: 'ellipsis' });
        drawMigrationSlider(control, { x: audio.x + 116, y, width: audio.width - 198, height: 22 });
        drawPixelTextInRect(context, fonts, `${Math.round(control.value * 100)}%`, { x: audio.x + audio.width - 74, y, width: 68, height: 20 }, { align: 'right', verticalAlign: 'center', color: '#6b4428' });
      });
      const muteY = audio.y + 170;
      drawPixelTextInRect(context, fonts, 'MUTE WHEN WINDOW LOSES FOCUS', {
        x: audio.x + 10, y: muteY, width: audio.width - 98, height: 24,
      }, { verticalAlign: 'center', color: '#51351f', overflow: 'ellipsis' });
      drawToggleSwitch(context, skin, { x: audio.x + audio.width - 82, y: muteY, width: 72, height: 24 }, { value: false, style: 'neutral' });
      const gameplay = drawMigrationInset({
        x: body.x + audioWidth + 14,
        y: panelY,
        width: body.width - audioWidth - 14,
        height: body.height - 46,
      }, 'GAMEPLAY QUICK SETTINGS');
      const toggles = [
        ['PLAYER NAMEPLATES', true],
        ['QUEST MARKERS', true],
        ['CHAT TIMESTAMPS', false],
        ['REDUCED MOTION', false],
      ] as const;
      toggles.forEach(([name, value], index) => {
        const y = gameplay.y + 9 + index * 43;
        drawPixelTextInRect(context, fonts, name, {
          x: gameplay.x + 8, y, width: gameplay.width - 96, height: 24,
        }, { verticalAlign: 'center', color: '#51351f', overflow: 'ellipsis' });
        if (index === 0) {
          drawMigrationToggle(migrationNameplatesToggle, { x: gameplay.x + gameplay.width - 82, y, width: 72, height: 24 });
        } else {
          drawToggleSwitch(context, skin, { x: gameplay.x + gameplay.width - 82, y, width: 72, height: 24 }, { value, style: 'neutral' });
        }
      });
      drawPixelTextInRect(context, fonts, 'AUDIO IS LIVE · OTHER PANELS ARE VISUAL SPECIMENS', {
        x: gameplay.x + 8, y: gameplay.y + gameplay.height - 18, width: gameplay.width - 16, height: 10,
      }, { align: 'center', color: '#986846', overflow: 'ellipsis' });
      break;
    }
    case 'developer': {
      const body = drawMigrationWindow(frame, 'DEVELOPER TOOLS', closable);
      const railWidth = 184;
      const sections = [
        ['WORLD', 'star'], ['PLAYER', 'key_r'], ['QUESTS', 'help'], ['RENDER', 'wrench'],
      ] as const;
      sections.forEach(([name, glyph], index) => {
        drawFantasyButton(context, skin, fonts, {
          x: body.x + 4,
          y: body.y + 8 + index * 48,
          width: railWidth - 8,
          height: 34,
        }, {
          tone: index === 0 ? 'green' : 'peach',
          shape: 'square',
          size: 'wide',
          glyph,
          label: name,
          state: index === 0 ? 'pressed' : 'idle',
        });
      });
      drawMigrationButtonRow({
        x: body.x + 8,
        y: body.y + body.height - 36,
        width: railWidth - 16,
        height: 28,
      }, [{ label: 'BACK', glyph: 'back' }]);
      const panel = drawMigrationInset({
        x: body.x + railWidth + 10,
        y: body.y + 4,
        width: body.width - railWidth - 14,
        height: body.height - 8,
      }, 'WORLD & TIME');
      const controlRow = layoutUiFlex({ x: panel.x + 8, y: panel.y + 8, width: panel.width - 16, height: 32 }, [
        { minSize: { width: 96, height: 32 } },
        { minSize: { width: 210, height: 32 }, grow: 1 },
        { minSize: { width: 96, height: 32 } },
      ], { gap: 12, align: 'stretch' });
      drawFantasyButton(context, skin, fonts, controlRow[0]!, { tone: 'peach', shape: 'chamfered', label: '− 1 HOUR' });
      drawProgressBar(context, { x: controlRow[1]!.x, y: controlRow[1]!.y + 10, width: controlRow[1]!.width, height: 12 }, 0.4);
      drawFantasyButton(context, skin, fonts, controlRow[2]!, { tone: 'peach', shape: 'chamfered', label: '+ 1 HOUR' });
      drawPixelTextInRect(context, fonts, 'SUMMER 12 · 09:40 · CLEAR · EAST WIND', {
        x: panel.x + 8, y: panel.y + 54, width: panel.width - 16, height: 16,
      }, { font: 'header', align: 'center', color: '#4d2e22', overflow: 'ellipsis' });
      const weatherRows = [
        ['WEATHER', 'AUTO'], ['WIND', 'EAST'], ['SEASON', 'SUMMER'],
      ] as const;
      weatherRows.forEach(([name, value], index) => {
        const y = panel.y + 86 + index * 43;
        drawPixelTextInRect(context, fonts, name, { x: panel.x + 12, y, width: 108, height: 26 }, { verticalAlign: 'center', color: '#51351f' });
        drawMigrationButtonRow({ x: panel.x + 126, y, width: panel.width - 138, height: 27 }, [
          { label: value, tone: index === 0 ? 'green' : index === 1 ? 'blue' : 'gold' },
        ]);
      });
      ['LIGHTING EFFECTS', 'CELLAR ORE VEINS', 'COLLISION OVERLAY'].forEach((name, index) => {
        const y = panel.y + 226 + index * 35;
        drawPixelTextInRect(context, fonts, name, { x: panel.x + 12, y, width: panel.width - 104, height: 24 }, { verticalAlign: 'center', color: index === 2 ? '#986846' : '#51351f', overflow: 'ellipsis' });
        drawToggleSwitch(context, skin, { x: panel.x + panel.width - 82, y, width: 72, height: 24 }, { value: index === 0, style: 'neutral', enabled: index < 2 });
      });
      break;
    }
    default: {
      const exhaustive: never = id;
      throw new Error(`Unhandled migration surface: ${exhaustive}`);
    }
  }
}

function drawMigrationGallery(): void {
  if (!worldRectVisible(SECTIONS.migration)) return;
  sectionRibbon.draw(
    context,
    'LIVE UI MIGRATION GALLERY',
    SECTIONS.migration.x + 30 + MIGRATION_LANE_WIDTH / 2,
    SECTIONS.migration.y,
    { maxWidth: 680, overflow: 'ellipsis' },
  );
  drawPixelTextInRect(context, fonts, 'CONTENT-SIZED LIVE SURFACES · SHARED COMPONENTS · APPROVAL BEFORE LIVE SWAP', {
    x: SECTIONS.migration.x + 30,
    y: SECTIONS.migration.y + 38,
    width: MIGRATION_LANE_WIDTH,
    height: 12,
  }, { align: 'center', color: '#c9d8c7', overflow: 'ellipsis' });

  MIGRATION_SPECIMEN_LAYOUT.forEach(({ surface, index, frame }) => {
    const specimenBounds = {
      x: frame.x - 8,
      y: frame.y - MIGRATION_LABEL_HEIGHT,
      width: frame.width + 16,
      height: frame.height + MIGRATION_LABEL_HEIGHT + 8,
    };
    if (!worldRectVisible(specimenBounds)) return;
    drawPixelTextInRect(context, fonts, `${String(index + 1).padStart(2, '0')} · ${surface.title.toUpperCase()}`, {
      x: frame.x, y: frame.y - 38, width: Math.max(0, frame.width - 118), height: 14,
    }, { font: 'header', color: '#f8ead0', overflow: 'ellipsis' });
    const category = { x: frame.x + frame.width - 106, y: frame.y - 40, width: 106, height: 18 };
    drawUiLabelPlate(context, skin, category);
    drawPixelTextInRect(context, fonts, surface.category.toUpperCase(), insetRect(category, { left: 4, right: 4 }), {
      align: 'center', verticalAlign: 'center', color: MIGRATION_CATEGORY_COLORS[surface.category], overflow: 'ellipsis',
    });
    drawPixelTextInRect(context, fonts, surface.description.toUpperCase(), {
      x: frame.x, y: frame.y - 18, width: frame.width, height: 11,
    }, { color: '#b7cab9', overflow: 'ellipsis' });
    drawMigrationSurface(surface.id, frame, surface.closable);
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

function drawRetainedFantasyButton(button: FantasyCanvasButton, rect: UiRect): void {
  button.setBounds(rect);
  button.setHovered(containsPoint(rect, pointerWorld));
  button.draw(context);
  addHit(rect, (_point, event) => {
    if (event.button === 0) button.press();
  });
}

function drawFantasyControlFamilies(): void {
  const content = drawSection(
    SECTIONS.fantasyControls,
    'COMPLETE CUTE FANTASY BUTTON & ICON FAMILIES',
    'BUTTON STATES / 31 GLYPHS / 624 ICONS / 80 SELECTORS / 380 SLIDER + SWITCH CELLS',
  );
  if (!worldRectVisible(SECTIONS.fantasyControls)) return;

  const leftX = content.x;
  const rightX = content.x + 1_040;
  const top = content.y;

  label('REUSABLE BUTTON CHROME', leftX, top, { header: true, color: '#4d2e22' });
  label('TONE', leftX, top + 22, { color: '#8b5a3c' });
  FANTASY_BUTTON_SHAPES.forEach((shape, index) => label(
    shape.toUpperCase(),
    leftX + 92 + index * 230 + 105,
    top + 22,
    { align: 'center', color: '#8b5a3c' },
  ));

  FANTASY_BUTTON_TONES.forEach((tone, toneIndex) => {
    const y = top + 40 + toneIndex * 31;
    label(tone.toUpperCase(), leftX, y + 7, { color: '#6b4428' });
    FANTASY_BUTTON_SHAPES.forEach((_shape, shapeIndex) => {
      const button = fantasyToneButtons[toneIndex * FANTASY_BUTTON_SHAPES.length + shapeIndex]!;
      drawRetainedFantasyButton(button, {
        x: leftX + 92 + shapeIndex * 230,
        y,
        width: 210,
        height: 22,
      });
    });
  });

  const stateY = top + 334;
  label('SOURCE STATES', leftX, stateY, { color: '#8b5a3c' });
  (['idle', 'pressed', 'disabled'] as const).forEach((state, index) => drawFantasyButton(
    context,
    skin,
    fonts,
    { x: leftX + index * 205, y: stateY + 18, width: 194, height: 22 },
    { tone: 'green', shape: 'pill', state, label: state.toUpperCase(), glyph: state === 'idle' ? 'play' : undefined },
  ));
  label('AUTHORED HOVER', leftX + 626, stateY, { color: '#8b5a3c' });
  drawFantasyButton(context, skin, fonts, {
    x: leftX + 626, y: stateY + 18, width: 176, height: 22,
  }, { tone: 'red', shape: 'chamfered', hovered: true, hoverOutline: 'gold', label: 'GOLD OUTLINE' });
  drawFantasyButton(context, skin, fonts, {
    x: leftX + 812, y: stateY + 18, width: 176, height: 22,
  }, { tone: 'purple', shape: 'square', hovered: true, hoverOutline: 'white', label: 'WHITE OUTLINE' });

  const resizeY = stateY + 58;
  label('REPEATED CENTRES — FIXED CAPS, VARIABLE FACE', leftX, resizeY, { color: '#8b5a3c' });
  [
    { width: 96, height: 16, label: '96×16' },
    { width: 172, height: 22, label: '172×22' },
    { width: 286, height: 30, label: '286×30 ELLIPSIS CONTRACT' },
  ].forEach((size, index) => drawFantasyButton(context, skin, fonts, {
    x: leftX + [0, 110, 296][index]!,
    y: resizeY + 18,
    width: size.width,
    height: size.height,
  }, { tone: 'gold', shape: FANTASY_BUTTON_SHAPES[index]!, label: size.label }));

  const glyphY = resizeY + 70;
  label('31 COMPOSABLE GLYPHS — CROSS IS A NORMAL BUTTON VARIANT', leftX, glyphY, {
    color: '#8b5a3c',
  });
  fantasyGlyphButtons.forEach((button, index) => {
    const column = index % 16;
    const row = Math.floor(index / 16);
    drawRetainedFantasyButton(button, {
      x: leftX + column * 39,
      y: glyphY + 18 + row * 39,
      width: 32,
      height: 32,
    });
  });
  label('HOVER FOR GOLD/WHITE OUTLINES — PRESS FOR THE AUTHORED DOWN STATE',
    leftX, glyphY + 102, { color: '#6b4428' });

  label('SEMANTIC ICON COMPONENTS', rightX, top, { header: true, color: '#4d2e22' });
  label('MULTI-FRAME LEVELS + MATCHED OUTLINE STATE', rightX, top + 22, { color: '#8b5a3c' });
  const now = performance.now();
  const semanticIconColumns = 8;
  const semanticIconGridY = top + 42;
  FANTASY_ICON_FAMILIES.forEach((definition, index) => {
    const column = index % semanticIconColumns;
    const row = Math.floor(index / semanticIconColumns);
    const cell = { x: rightX + column * 78, y: semanticIconGridY + row * 64, width: 68, height: 56 };
    const iconRect = { x: cell.x + 18, y: cell.y, width: 32, height: 32 };
    const hovered = containsPoint(cell, pointerWorld);
    drawFantasyIcon(context, skin, iconRect, definition, { now, hovered });
    drawPixelTextInRect(context, fonts, definition.label.toUpperCase(), {
      x: cell.x,
      y: cell.y + 39,
      width: cell.width,
      height: 9,
    }, { align: 'center', color: '#6b4428', overflow: 'ellipsis' });
    addHit(cell, () => notify(
      `${definition.label.toUpperCase()} ICON — ${definition.frames.length} LEVEL${definition.frames.length === 1 ? '' : 'S'}${definition.outline === undefined ? '' : ' + OUTLINE'}`,
    ));
  });

  const semanticIconRows = Math.ceil(FANTASY_ICON_FAMILIES.length / semanticIconColumns);
  const catalogY = semanticIconGridY + semanticIconRows * 64 + 12;
  label('COMPLETE UI_ICONS.PNG CELL CATALOG', rightX, catalogY, { color: '#8b5a3c' });
  label(`${FANTASY_ICON_CATALOG_COLUMNS} COLUMNS × ${FANTASY_ICON_CATALOG_ROWS} ROWS`,
    rightX + 1_000, catalogY, { align: 'right', color: '#8b5a3c' });
  const cellSize = 24;
  const catalogRect: UiRect = {
    x: rightX,
    y: catalogY + 18,
    width: FANTASY_ICON_CATALOG_COLUMNS * cellSize,
    height: FANTASY_ICON_CATALOG_ROWS * cellSize,
  };
  context.fillStyle = '#ead0aa66';
  context.fillRect(catalogRect.x, catalogRect.y, catalogRect.width, catalogRect.height);
  for (let row = 0; row < FANTASY_ICON_CATALOG_ROWS; row += 1) {
    for (let column = 0; column < FANTASY_ICON_CATALOG_COLUMNS; column += 1) {
      const cell = {
        x: catalogRect.x + column * cellSize,
        y: catalogRect.y + row * cellSize,
        width: cellSize,
        height: cellSize,
      };
      const hovered = containsPoint(cell, pointerWorld);
      if (hovered) {
        context.fillStyle = '#63c74d66';
        context.fillRect(cell.x, cell.y, cell.width, cell.height);
      }
      context.strokeStyle = '#9d684326';
      context.strokeRect(cell.x + 0.5, cell.y + 0.5, cell.width - 1, cell.height - 1);
      drawFantasyIconCell(context, skin.iconCatalog, {
        x: cell.x + 4,
        y: cell.y + 4,
        width: 16,
        height: 16,
      }, row * FANTASY_ICON_CATALOG_COLUMNS + column);
    }
  }
  addHit(catalogRect, (point) => {
    const column = Math.max(0, Math.min(FANTASY_ICON_CATALOG_COLUMNS - 1,
      Math.floor((point.x - catalogRect.x) / cellSize)));
    const row = Math.max(0, Math.min(FANTASY_ICON_CATALOG_ROWS - 1,
      Math.floor((point.y - catalogRect.y) / cellSize)));
    notify(`ICON CATALOG CELL R${row} C${column} — FRAME ${row * FANTASY_ICON_CATALOG_COLUMNS + column}`);
  });
  label('THE RAW CATALOG STAYS AVAILABLE WHILE SEMANTIC DEFINITIONS GROUP ANIMATION LEVELS AND OUTLINES.',
    rightX, catalogRect.y + catalogRect.height + 14, { color: '#6b4428' });

  const controlCatalogY = catalogRect.y + catalogRect.height + 48;
  label('COMPLETE UI_SLIDERS.PNG CELL CATALOG', rightX, controlCatalogY, { color: '#8b5a3c' });
  const sliderCellSize = 14;
  const sliderCatalogRect = {
    x: rightX,
    y: controlCatalogY + 18,
    width: AUTHORED_SLIDER_CATALOG_COLUMNS * sliderCellSize,
    height: AUTHORED_SLIDER_CATALOG_ROWS * sliderCellSize,
  };
  context.fillStyle = '#ead0aa66';
  context.fillRect(sliderCatalogRect.x, sliderCatalogRect.y, sliderCatalogRect.width, sliderCatalogRect.height);
  for (let row = 0; row < AUTHORED_SLIDER_CATALOG_ROWS; row += 1) {
    for (let column = 0; column < AUTHORED_SLIDER_CATALOG_COLUMNS; column += 1) {
      drawAuthoredSliderCell(context, skin.sliderCatalog, {
        x: sliderCatalogRect.x + column * sliderCellSize,
        y: sliderCatalogRect.y + row * sliderCellSize,
        width: sliderCellSize,
        height: sliderCellSize,
      }, column, row);
    }
  }
  addHit(sliderCatalogRect, (point) => notify(
    `SLIDER SOURCE CELL R${Math.floor((point.y - sliderCatalogRect.y) / sliderCellSize)} C${Math.floor((point.x - sliderCatalogRect.x) / sliderCellSize)}`,
  ));

  const selectorCatalogX = sliderCatalogRect.x + sliderCatalogRect.width + 42;
  label('ALL 80 SELECTORS', selectorCatalogX, controlCatalogY, { color: '#8b5a3c' });
  const selectorCellSize = 10;
  const selectorCatalogRect = {
    x: selectorCatalogX,
    y: controlCatalogY + 18,
    width: AUTHORED_SELECTOR_COLUMNS * selectorCellSize,
    height: AUTHORED_SELECTOR_ROWS * selectorCellSize,
  };
  context.fillStyle = '#ead0aa66';
  context.fillRect(selectorCatalogRect.x, selectorCatalogRect.y,
    selectorCatalogRect.width, selectorCatalogRect.height);
  for (let row = 0; row < AUTHORED_SELECTOR_ROWS; row += 1) {
    for (let column = 0; column < AUTHORED_SELECTOR_COLUMNS; column += 1) {
      drawAuthoredSelectorCell(context, skin.selectorCatalog, {
        x: selectorCatalogRect.x + column * selectorCellSize,
        y: selectorCatalogRect.y + row * selectorCellSize,
        width: selectorCellSize,
        height: selectorCellSize,
      }, { column, row });
    }
  }
  addHit(selectorCatalogRect, (point) => notify(
    `SELECTOR SOURCE CELL R${Math.floor((point.y - selectorCatalogRect.y) / selectorCellSize)} C${Math.floor((point.x - selectorCatalogRect.x) / selectorCellSize)}`,
  ));
}

const ACTOR_KIND_TABS = ['all', 'npc', 'faction', 'enemy', 'effect'] as const;
const ACTOR_CATALOG_PAGE_SIZE = 30;

function actorEntriesForKind(kind: CuteFantasyActorKind | 'all'): readonly CuteFantasyActorCatalogEntry[] {
  return kind === 'all'
    ? CUTE_FANTASY_ACTOR_CATALOG
    : CUTE_FANTASY_ACTOR_CATALOG.filter((entry) => entry.kind === kind);
}

function actorAnimationFrame(asset: LoadedAsset, animation: string, now: number): number {
  if (reducedMotionQuery.matches) return 0;
  const frames = asset.metadata.animations[animation] ?? [];
  const fps = asset.metadata.animationMeta?.[animation]?.fps ?? 8;
  return frames.length === 0 ? 0 : Math.floor(now * fps / 1_000) % frames.length;
}

function drawActorSprite(
  asset: LoadedAsset | null,
  animation: string,
  bounds: UiRect,
  now: number,
): void {
  context.save();
  context.beginPath();
  context.rect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.clip();
  if (asset === null) {
    context.fillStyle = '#e8bd8b55';
    context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    drawPixelTextInRect(context, fonts, 'LOADING', bounds, {
      align: 'center', verticalAlign: 'center', color: '#9d6843', overflow: 'ellipsis',
    });
    context.restore();
    return;
  }
  const frame = uiAssetFrame(asset, animation, actorAnimationFrame(asset, animation, now));
  if (frame !== null) {
    const scale = Math.max(1, Math.min(4, Math.floor(Math.min(
      bounds.width / frame.width,
      bounds.height / frame.height,
    ))));
    const width = frame.width * scale;
    const height = frame.height * scale;
    const x = Math.round(bounds.x + (bounds.width - width) / 2);
    const y = Math.round(bounds.y + (bounds.height - height) / 2);
    context.imageSmoothingEnabled = false;
    context.drawImage(asset.image, frame.x, frame.y, frame.width, frame.height, x, y, width, height);
  }
  context.restore();
}

function drawActorCatalogCard(
  entry: CuteFantasyActorCatalogEntry,
  rect: UiRect,
  now: number,
): void {
  drawUiFrame(context, skin, rect, 'thin');
  const selected = entry.id === selectedActorId;
  const hovered = containsPoint(rect, pointerWorld);
  if (selected || hovered) {
    context.fillStyle = selected ? '#63c74d38' : '#f6ca9f44';
    context.fillRect(rect.x + 4, rect.y + 4, rect.width - 8, rect.height - 8);
  }
  const asset = requestActorAsset(entry.asset);
  const previewAnimation = entry.animations.find((name) => name.startsWith('idle')) ?? entry.animations[0] ?? 'base';
  drawActorSprite(asset, previewAnimation, {
    x: rect.x + 5, y: rect.y + 5, width: 64, height: 64,
  }, now);
  drawPixelTextInRect(context, fonts, entry.label.toUpperCase(), {
    x: rect.x + 73, y: rect.y + 10, width: rect.width - 79, height: 10,
  }, { color: '#4d2e22', overflow: 'ellipsis' });
  drawPixelTextInRect(context, fonts, entry.family.toUpperCase(), {
    x: rect.x + 73, y: rect.y + 29, width: rect.width - 79, height: 9,
  }, { color: '#8b5a3c', overflow: 'ellipsis' });
  drawPixelTextInRect(context, fonts, `${entry.animations.length} ANIMATION${entry.animations.length === 1 ? '' : 'S'}`, {
    x: rect.x + 73, y: rect.y + 47, width: rect.width - 79, height: 9,
  }, { color: '#6b4428', overflow: 'ellipsis' });
  addHit(rect, () => {
    selectedActorId = entry.id;
    notify(`${entry.label.toUpperCase()} — ${entry.animations.length} ANIMATION GROUPS`);
  });
}

function drawActorAnimationCard(
  entry: CuteFantasyActorCatalogEntry,
  asset: LoadedAsset | null,
  animation: string,
  rect: UiRect,
  now: number,
): void {
  drawUiFrame(context, skin, rect, 'thin');
  drawPixelTextInRect(context, fonts, animation.replaceAll('_', ' ').toUpperCase(), {
    x: rect.x + 6, y: rect.y + 7, width: rect.width - 12, height: 10,
  }, { align: 'center', color: '#4d2e22', overflow: 'ellipsis' });
  drawActorSprite(asset, animation, {
    x: rect.x + 6, y: rect.y + 21, width: rect.width - 12, height: 78,
  }, now);
  const frameCount = asset?.metadata.animations[animation]?.length ?? 0;
  const fps = asset?.metadata.animationMeta?.[animation]?.fps ?? 8;
  const loop = asset?.metadata.animationMeta?.[animation]?.loop ?? true;
  drawPixelTextInRect(context, fonts, frameCount > 0
    ? `${frameCount}F · ${fps}FPS · ${loop ? 'LOOP' : 'ONE-SHOT'}`
    : 'ATLAS LOADING', {
    x: rect.x + 6, y: rect.y + rect.height - 16, width: rect.width - 12, height: 9,
  }, { align: 'center', color: '#8b5a3c', overflow: 'ellipsis' });
  addHit(rect, () => notify(
    `${entry.label.toUpperCase()} · ${animation.toUpperCase()} · ${frameCount || entry.animations.length} FRAME CONTRACT`,
  ));
}

function selectActorCatalogPage(entries: readonly CuteFantasyActorCatalogEntry[], page: number): void {
  const pageCount = Math.max(1, Math.ceil(entries.length / ACTOR_CATALOG_PAGE_SIZE));
  actorCatalogPage = Math.max(0, Math.min(pageCount - 1, page));
  const first = entries[actorCatalogPage * ACTOR_CATALOG_PAGE_SIZE];
  if (first !== undefined) selectedActorId = first.id;
}

function stepActorSelection(delta: number): void {
  const entries = actorEntriesForKind(selectedActorKind);
  if (entries.length === 0) return;
  const current = Math.max(0, entries.findIndex((entry) => entry.id === selectedActorId));
  const next = (current + delta + entries.length) % entries.length;
  const selected = entries[next]!;
  selectedActorId = selected.id;
  actorCatalogPage = Math.floor(next / ACTOR_CATALOG_PAGE_SIZE);
  notify(`${selected.label.toUpperCase()} — ${next + 1}/${entries.length} · ${selected.animations.length} ANIMATION GROUPS`);
}

function drawActorAnimationLibrary(): void {
  if (!worldRectVisible(SECTIONS.actors)) return;
  label('NPC, ENEMY & PROJECTILE ANIMATION LIBRARY', SECTIONS.actors.x, SECTIONS.actors.y, {
    header: true, scale: 2, color: '#181425', outline: true, outlineColor: '#ffffff',
  });
  label(`${CUTE_FANTASY_ACTOR_CATALOG.length} GAME-LOADABLE ASSETS · EVERY AUTHORED ROW · VISIBLE-ONLY AUTHORED-FPS PREVIEWS · [ ] SELECT`,
    SECTIONS.actors.x + 2, SECTIONS.actors.y + 30, {
      color: '#b9d3c2', outline: true, outlineColor: '#181425',
    });
  const content: UiRect = {
    x: SECTIONS.actors.x,
    y: SECTIONS.actors.y + 52,
    width: SECTIONS.actors.width,
    height: SECTIONS.actors.height - 52,
  };

  const now = performance.now();
  const leftWidth = 650;
  const tabGap = 6;
  const tabWidth = Math.floor((leftWidth - tabGap * (ACTOR_KIND_TABS.length - 1)) / ACTOR_KIND_TABS.length);
  ACTOR_KIND_TABS.forEach((kind, index) => {
    const rect = {
      x: content.x + index * (tabWidth + tabGap), y: content.y, width: tabWidth, height: 24,
    };
    const count = actorEntriesForKind(kind).length;
    drawFantasyButton(context, skin, fonts, rect, {
      tone: selectedActorKind === kind ? 'green' : 'peach',
      shape: 'chamfered',
      hovered: containsPoint(rect, pointerWorld),
      label: `${kind.toUpperCase()} ${count}`,
    });
    addHit(rect, () => {
      selectedActorKind = kind;
      actorCatalogPage = 0;
      const first = actorEntriesForKind(kind)[0];
      if (first !== undefined) selectedActorId = first.id;
      notify(`${kind.toUpperCase()} ACTOR FILTER — ${count} ASSETS`);
    });
  });

  const entries = actorEntriesForKind(selectedActorKind);
  const pageCount = Math.max(1, Math.ceil(entries.length / ACTOR_CATALOG_PAGE_SIZE));
  actorCatalogPage = Math.min(actorCatalogPage, pageCount - 1);
  const pageEntries = entries.slice(
    actorCatalogPage * ACTOR_CATALOG_PAGE_SIZE,
    (actorCatalogPage + 1) * ACTOR_CATALOG_PAGE_SIZE,
  );
  let selected: CuteFantasyActorCatalogEntry | undefined = CUTE_FANTASY_ACTOR_CATALOG
    .find((entry) => entry.id === selectedActorId);
  if (selected === undefined) {
    selected = pageEntries[0] ?? CUTE_FANTASY_ACTOR_CATALOG[0];
    if (selected !== undefined) selectedActorId = selected.id;
  }
  if (selected === undefined) return;

  const bodyY = content.y + 34;
  const listRows = Math.max(1, Math.ceil(pageEntries.length / 3));
  const leftPanel: UiRect = {
    x: content.x,
    y: bodyY,
    width: leftWidth,
    height: Math.min(content.height - 34, 48 + listRows * 74 + Math.max(0, listRows - 1) * 6 + 42),
  };
  drawUiFrame(context, skin, leftPanel, 'thin');
  const leftContent = uiFrameContentRect(leftPanel, 'thin', 6);
  label(`ASSET CATALOG · PAGE ${actorCatalogPage + 1}/${pageCount}`, leftContent.x, leftContent.y, {
    color: '#8b5a3c',
  });
  const listGrid = layoutUiGrid({
    x: leftContent.x,
    y: leftContent.y + 24,
    width: leftContent.width,
    height: Math.max(0, leftContent.height - 64),
  }, pageEntries.map(() => ({ width: 1, height: 74 })), {
    columns: 3, rowHeight: 74, columnGap: 6, rowGap: 6,
  });
  pageEntries.forEach((entry, index) => {
    const rect = listGrid.items[index];
    if (rect !== undefined) drawActorCatalogCard(entry, rect, now);
  });
  if (pageCount > 1) {
    const pagerY = leftPanel.y + leftPanel.height - 34;
    const previous = { x: leftPanel.x + 8, y: pagerY, width: 90, height: 22 };
    const next = { x: leftPanel.x + leftPanel.width - 98, y: pagerY, width: 90, height: 22 };
    drawFantasyButton(context, skin, fonts, previous, {
      tone: 'peach', shape: 'pill', state: actorCatalogPage === 0 ? 'disabled' : 'idle', label: '< PREV',
    });
    drawFantasyButton(context, skin, fonts, next, {
      tone: 'peach', shape: 'pill', state: actorCatalogPage >= pageCount - 1 ? 'disabled' : 'idle', label: 'NEXT >',
    });
    if (actorCatalogPage > 0) addHit(previous, () => {
      selectActorCatalogPage(entries, actorCatalogPage - 1);
      notify(`ACTOR CATALOG PAGE ${actorCatalogPage + 1}/${pageCount}`);
    });
    if (actorCatalogPage < pageCount - 1) addHit(next, () => {
      selectActorCatalogPage(entries, actorCatalogPage + 1);
      notify(`ACTOR CATALOG PAGE ${actorCatalogPage + 1}/${pageCount}`);
    });
  }

  const animationColumns = 6;
  const animationRows = Math.max(1, Math.ceil(selected.animations.length / animationColumns));
  const companionHeight = selected.companions.length > 0 ? 140 : 0;
  const rightPanel: UiRect = {
    x: content.x + leftWidth + 14,
    y: bodyY,
    width: content.width - leftWidth - 14,
    height: Math.min(content.height - 34, 82 + animationRows * 124 + Math.max(0, animationRows - 1) * 6 + companionHeight),
  };
  drawUiFrame(context, skin, rightPanel, 'thin');
  const detail = uiFrameContentRect(rightPanel, 'thin', 8);
  drawPixelTextInRect(context, fonts, selected.label.toUpperCase(), {
    x: detail.x, y: detail.y, width: detail.width * 0.55, height: 18,
  }, { font: 'header', color: '#4d2e22', overflow: 'ellipsis' });
  drawPixelTextInRect(context, fonts, `${selected.kind.toUpperCase()} · ${selected.family.toUpperCase()} · ${selected.size[0]}×${selected.size[1]}`, {
    x: detail.x + detail.width * 0.55, y: detail.y + 2, width: detail.width * 0.45, height: 12,
  }, { align: 'right', color: '#8b5a3c', overflow: 'ellipsis' });
  drawPixelTextInRect(context, fonts, selected.id.toUpperCase(), {
    x: detail.x, y: detail.y + 25, width: detail.width * 0.44, height: 9,
  }, { color: '#6b4428', overflow: 'ellipsis' });
  drawPixelTextInRect(context, fonts, selected.sourcePath, {
    x: detail.x + detail.width * 0.44, y: detail.y + 25, width: detail.width * 0.56, height: 9,
  }, { align: 'right', color: '#9d6843', overflow: 'ellipsis' });

  const selectedAsset = requestActorAsset(selected.asset);
  const animationGrid = layoutUiGrid({
    x: detail.x,
    y: detail.y + 44,
    width: detail.width,
    height: animationRows * 124 + Math.max(0, animationRows - 1) * 6,
  }, selected.animations.map(() => ({ width: 1, height: 124 })), {
    columns: animationColumns, rowHeight: 124, columnGap: 6, rowGap: 6,
  });
  selected.animations.forEach((animation, index) => {
    const rect = animationGrid.items[index];
    if (rect !== undefined) drawActorAnimationCard(selected, selectedAsset, animation, rect, now);
  });

  if (selected.companions.length > 0) {
    const gridBottom = animationGrid.cells.at(-1)?.y ?? detail.y + 44;
    const companionsY = gridBottom + 124 + 18;
    label('COMPANION SHEETS · PROJECTILES / WEAPONS / VFX', detail.x, companionsY, { color: '#8b5a3c' });
    const companionEntries = selected.companions
      .map((id) => cuteFantasyActor(id))
      .filter((entry): entry is CuteFantasyActorCatalogEntry => entry !== undefined);
    const companionGrid = layoutUiGrid({
      x: detail.x, y: companionsY + 18, width: detail.width, height: 102,
    }, companionEntries.map(() => ({ width: 1, height: 96 })), {
      columns: Math.min(4, Math.max(1, companionEntries.length)), rowHeight: 96, columnGap: 6,
    });
    companionEntries.forEach((entry, index) => {
      const rect = companionGrid.items[index];
      if (rect === undefined) return;
      drawUiFrame(context, skin, rect, 'thin');
      const asset = requestActorAsset(entry.asset);
      drawActorSprite(asset, entry.animations[0] ?? 'base', {
        x: rect.x + 5, y: rect.y + 5, width: 74, height: rect.height - 10,
      }, now);
      drawPixelTextInRect(context, fonts, entry.label.toUpperCase(), {
        x: rect.x + 84, y: rect.y + 14, width: rect.width - 90, height: 10,
      }, { color: '#4d2e22', overflow: 'ellipsis' });
      drawPixelTextInRect(context, fonts, entry.animations.join(' / ').toUpperCase(), {
        x: rect.x + 84, y: rect.y + 38, width: rect.width - 90, height: 28,
      }, { color: '#8b5a3c', overflow: 'ellipsis' });
      addHit(rect, () => {
        selectedActorKind = 'effect';
        actorCatalogPage = Math.max(0, Math.floor(actorEntriesForKind('effect').findIndex((candidate) => candidate.id === entry.id) / ACTOR_CATALOG_PAGE_SIZE));
        selectedActorId = entry.id;
        notify(`${entry.label.toUpperCase()} COMPANION SHEET`);
      });
    });
  }

  // Animation work is scheduled only while this section intersects the viewport.
  scheduleActorAnimationRender();
}

function drawToolbar(): void {
  const height = 42;
  drawUiSkinAsset(context, skin.panelWood, { x: 0, y: 0, width: cssWidth, height });
  const showMigrationJump = cssWidth >= 760;
  const buttonStripX = cssWidth - (showMigrationJump ? 284 : 202);
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
  if (showMigrationJump) drawButton(context, skin, fonts, { x: cssWidth - 284, y: 9, width: 76, height: 24 }, {
    label: 'LIVE UI', tone: 'neutral',
  });
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
  label('LIVE UI MIGRATION CANDIDATES', 2540, 45, {
    header: true, scale: 2, color: '#181425', outline: true, outlineColor: '#ffffff',
  });
  label('PAN EAST OR USE LIVE UI · APPROVAL GALLERY ONLY · GAME SCREENS REMAIN UNSWAPPED', 2542, 76, {
    color: '#b9d3c2', outline: true,
  });
  drawFoundations();
  drawFrames();
  drawControls();
  drawInventory();
  drawFeedback();
  drawPatterns();
  drawBooks();
  drawFantasyControlFamilies();
  drawActorAnimationLibrary();
  drawMigrationGallery();
  drawHeldCursorStack();
  context.restore();
  drawToolbar();
}

function resize(): void {
  cssWidth = Math.max(1, Math.floor(innerWidth));
  cssHeight = Math.max(1, Math.floor(innerHeight));
  dpr = Math.max(1, Math.min(2, devicePixelRatio));
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

function migrationView(): void {
  camera = { x: SECTIONS.migration.x + 930, y: SECTIONS.migration.y + 470 };
  zoom = Math.max(0.42, Math.min(0.82, cssWidth / 1840, cssHeight / 940));
  notify('LIVE UI — 27 CURRENT SURFACES RE-COMPOSED FOR MIGRATION REVIEW');
}

function actorLibraryView(): void {
  camera = {
    x: SECTIONS.actors.x + SECTIONS.actors.width / 2,
    y: SECTIONS.actors.y + SECTIONS.actors.height / 2,
  };
  zoom = Math.max(0.38, Math.min(0.72, cssWidth / 2480, cssHeight / 1220));
  notify(`ACTOR LIBRARY — ${CUTE_FANTASY_ACTOR_CATALOG.length} GAME-LOADABLE NPC, ENEMY, AND EFFECT ASSETS`);
}

function authoredControlsView(): void {
  camera = {
    x: SECTIONS.fantasyControls.x + SECTIONS.fantasyControls.width / 2,
    y: SECTIONS.fantasyControls.y + SECTIONS.fantasyControls.height / 2,
  };
  zoom = Math.max(0.42, Math.min(0.78, cssWidth / 2480, cssHeight / 1080));
  notify('AUTHORED CONTROLS — BUTTON, GLYPH, ICON, SELECTOR, SLIDER, AND SWITCH FAMILIES');
}

canvas.addEventListener('pointerdown', (event) => {
  pointerScreen = screenPoint(event);
  pointerWorld = screenToWorld(pointerScreen);
  if (pointerScreen.y < 42 && event.button === 0) {
    if (cssWidth >= 760 && pointerScreen.x >= cssWidth - 284 && pointerScreen.x < cssWidth - 208) migrationView();
    else if (pointerScreen.x >= cssWidth - 202 && pointerScreen.x < cssWidth - 144) fitWorld();
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
  } else if (activeInteraction?.kind === 'slider') activeInteraction.control.pointerMove(pointerWorld);
  else if (activeInteraction?.kind === 'scrollbar') scrollBar.pointerMove(pointerWorld);
  else if (activeInteraction?.kind === 'inventory' && hovered !== null) inventory.pointerEnter(hovered.ref);
  requestUiLabRender();
});

function finishPointer(event: PointerEvent): void {
  pointerScreen = screenPoint(event);
  pointerWorld = screenToWorld(pointerScreen);
  if (activeInteraction?.kind === 'resize') resizeController.pointerUp();
  else if (activeInteraction?.kind === 'slider') activeInteraction.control.pointerUp(pointerWorld);
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
  verticalSlider.pointerLeave();
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
  if (containsPoint(verticalSliderRect, pointerWorld)) {
    verticalSlider.node.onWheel?.({ point: pointerWorld, deltaX: event.deltaX, deltaY: event.deltaY }, verticalSlider.node);
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
  else if (event.key.toLowerCase() === 'm') migrationView();
  else if (event.key.toLowerCase() === 'a') actorLibraryView();
  else if (event.key.toLowerCase() === 'c') authoredControlsView();
  else if (event.key === '[' && worldRectVisible(SECTIONS.actors)) {
    event.preventDefault();
    stepActorSelection(-1);
  } else if (event.key === ']' && worldRectVisible(SECTIONS.actors)) {
    event.preventDefault();
    stepActorSelection(1);
  } else if (event.key === '1') { zoom = 1; notify('ZOOM 1:1'); }
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
const uiLabHeartbeat = window.setInterval(() => {
  if (document.activeElement === nativeInput || worldRectVisible(SECTIONS.fantasyControls)) {
    requestUiLabRender();
  }
}, 160);
const handleReducedMotionChange = (): void => requestUiLabRender();
reducedMotionQuery.addEventListener('change', handleReducedMotionChange);
window.addEventListener('pagehide', () => {
  uiLabDisposed = true;
  if (renderRequest !== null) cancelAnimationFrame(renderRequest);
  if (actorAnimationTimer !== null) window.clearTimeout(actorAnimationTimer);
  window.clearInterval(uiLabHeartbeat);
  reducedMotionQuery.removeEventListener('change', handleReducedMotionChange);
}, { once: true });
