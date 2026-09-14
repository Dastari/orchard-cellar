import { UI_DEVELOPER_TABS } from '../components/developer.js';
import { UI_SETTINGS_TABS } from '../components/settings.js';
import { UI_CHARACTER_PORTRAIT_ASSETS } from '../components/character-portrait.js';
import { craftingRecipeBookEntries, craftingRecipePattern } from '../../recipe-book.js';
import { bootstrapContentDefinitions, bootstrapContentRegistry, homesteadBuildDefinitions, SKILL_NODE_DEFINITIONS, itemDefinition, ITEM_ECONOMY, merchantOffers, type FrameContentDefinition } from '@orchard/sim';
import type { UiLabMigrationSurfaceId } from '../../ui-lab-catalog.js';
import type { UiGameSurfaceOptions, UiGameRow } from '../components/game-surface.js';
import type { UiLabMocks } from './registry.js';
import { uiLabInventory } from './inventory-mock.js';
const definitions = bootstrapContentDefinitions();
const registry = { items: new Map(definitions.filter(definition => definition.kind === 'item').map(definition => [definition.id, definition])), processes: new Map(definitions.filter(definition => definition.kind === 'process').map(definition => [definition.id, definition])) };
const aliases = { entity: 'entity', backpack: 'backpack', hotbar: 'hotbar', equipment: 'equipment', crafting: 'crafting', merchant: 'merchant' } as const;
/** Deterministic host data. Inventory writes use the same local authority as the
 * transaction district; all other actions remain observable through the lab. */
export function uiLabGameOptions(id: UiLabMigrationSurfaceId, props: Readonly<Record<string, unknown>>, mock: UiLabMocks): UiGameSurfaceOptions {
  const definition = definitions.find((definition): definition is FrameContentDefinition => definition.id === `frame:${['chest','barrel','furnace','cooking','press','fermentation','crafting'].includes(id) ? id : 'pack'}`)!;
  const frame = { definition, aliases, registry }, { controller, artwork } = uiLabInventory(mock, undefined, Boolean(props['empty']), frame);
  let rows: UiGameRow[] = props['empty'] ? [] : [
    { id: 'apple', label: 'Apple harvest', detail: 'Gather fruit from the orchard', value: 12, progress: 0.6 },
    { id: 'wood', label: 'Wood supplies', detail: 'Bring logs to the cellar', value: 8, progress: 0.4 },
    { id: 'tea', label: 'Orchard tea', detail: 'Share a warm cup with Mara', value: 3, progress: 0.8 },
  ];
  if (!props['empty']) {
    if (id === 'online-players') rows = [{ id: 'mara', label: 'Mara', detail: 'Orchard farmer · Sanctuary' }, { id: 'toby', label: 'Toby', detail: 'Cellar keeper · Orchard' }];
    else if (id === 'chat') rows = [{ id: '1', label: 'Mara', detail: 'The apples are ready!' }, { id: '2', label: 'Toby', detail: 'I will bring a basket.' }];
    else if (id === 'npc-dialogue') rows = [{ id: 'harvest', label: 'Tell me about the harvest' }, { id: 'shop', label: 'Show me your supplies' }, { id: 'leave', label: 'Goodbye' }];
    else if (id === 'target-effects') rows = [{ id: 'warm', label: 'Warm', detail: '12s' }, { id: 'rested', label: 'Rested', detail: '60s' }];
  }
  if (id === 'feedback-overlays') for (const name of ['icon_cf_quest_offer', 'icon_cf_quest_complete']) mock.requestAsset?.(name);
  if(id==='character')for(const name of UI_CHARACTER_PORTRAIT_ASSETS)mock.requestAsset?.(name);
  if(id==='skills')for(const node of SKILL_NODE_DEFINITIONS)mock.requestAsset?.(`icon_skill_${node.id}`);
  const buildRegistry = id === 'build-palette' ? bootstrapContentRegistry() : undefined;
  const buildEntries = buildRegistry && props['mode'] !== 'empty' && !props['empty']
    ? [...homesteadBuildDefinitions(buildRegistry).values()].map(entry => ({ ...entry, iconAnimation: itemDefinition(entry.itemKind)?.iconAnimation ?? 'base' })) : [];
  const buildUpgrades = buildRegistry ? Object.values(buildRegistry.compiled.upgrades) : [];
  for (const entry of buildEntries) { const key = itemDefinition(entry.itemKind)?.iconKey; if (key) mock.requestAsset?.(key); }
  return { id,
    buildPalette: buildRegistry ? { model: { entries: buildEntries, upgrades: buildUpgrades,
      counts: Object.fromEntries(buildEntries.map((entry,index) => [entry.itemKind, props['mode'] === 'poor' ? 0 : index + 1])),
      upgradeRanks: Object.fromEntries(buildUpgrades.map(upgrade => [upgrade.kind, props['mode'] === 'max' ? upgrade.maximumRank : 0])),
      balanceBronze: props['mode'] === 'poor' ? 0n : 100000000n,
      selection: buildEntries[0] ? {kind:'place',itemKind:buildEntries[0].itemKind} : {kind:'remove'} },
      artwork: Object.defineProperties({},Object.fromEntries(buildEntries.map(entry => [entry.itemKind,{enumerable:true,get:()=>mock.assets?.get(itemDefinition(entry.itemKind)?.iconKey ?? '')}]))) } : undefined,
    delve:{run:{roomNumber:2,roomKind:props['mode']==='boon'?'combat':'shop',theme:'cellar',phase:'reward',wave:0,maximumWaves:3,currency:props['mode']==='poor'?0:20},offers:['keen_edge','iron_heart','field_dressing'].map((upgradeId,slot)=>({slot,upgradeId,rarity:['uncommon','rare','legendary'][slot]!,magnitudePermille:160,cost:props['mode']==='boon'?0:(slot+1)*10}))},
    chatDraft:props['mode']==='commands'?'/whisper ':undefined,
    chat:{open:props['mode']!=='collapsed'&&props['mode']!=='unread',collapsed:props['mode']==='collapsed'||props['mode']==='unread',unread:props['mode']==='unread',hovered:false,touch:false,blocked:false,lines:rows.map(row=>({id:row.id,text:`[General] ${row.label}: ${row.detail??''}`,arrivedAt:0})),suggestions:[],suggestionIndex:0},
    characterName: { busy: props['mode'] === 'saving', error: props['mode'] === 'taken' ? 'THAT CHARACTER NAME IS ALREADY TAKEN' : null },
    gatewayLoading: props['mode']==='loading'||props['mode']==='connection-error'?{title:props['mode']==='connection-error'?'THE FERRY COULD NOT DOCK':'GROWING YOUR ISLAND',detail:props['mode']==='connection-error'?'CHECK YOUR CONNECTION AND REFRESH TO TRY AGAIN':'READING TERRAIN, TIME, AND WEATHER',progress:props['mode']==='connection-error'?100:78,error:props['mode']==='connection-error'}:undefined,
    gateway:{localPreview:props['mode']==='local'||props['empty']===true,signedIn:props['mode']==='signed-in',displayName:'Mara',profiles:props['empty']?[]:['Mara','Toby','Hazel','Juniper','Robin','Willow','Clover'],selected:0,message:props['mode']==='busy'?'OPENING SIGN IN':'CHOOSE AN ACCOUNT OR LOCAL DEVELOPMENT PROFILE',error:props['mode']==='error'?'Unable to start login. Please try again.':null,busy:props['mode']==='busy',allowLocalPreview:true,version:'0.2.3'},
    developerTab:UI_DEVELOPER_TABS.find(tab=>tab===props['page']), settingsTab:UI_SETTINGS_TABS.find(tab=>tab===props['page']), gameSettings:{audioVolumes:{master:.8,music:.7,sfx:.35},nameplatesVisible:true,lightingModel:'classic'}, gameMenu:{canAdministerWorld:props['mode']==='privileged',delveActive:props['mode']==='privileged',pwaUpdateStatus:props['empty']?'unsupported':props['mode']==='checking'?'checking':props['mode']==='updating'?'updating':props['mode']==='privileged'?'available':'current',fullscreenAvailable:props['mode']!=='fullscreen-unavailable'}, trade:{identityHex:'mara',requesterName:'Mara',recipientName:'Toby',walletBronze:12345n,offers:[],inventorySlots:props['empty']?[]:[{slot:0,itemKind:'wood',quantity:12},{slot:1,itemKind:'apple',quantity:5}],session:{id:'lab-trade',requester:{toHexString:()=> 'mara'},recipient:{toHexString:()=> 'toby'},state:'active',requesterAccepted:false,recipientAccepted:false,requesterBronze:0n,recipientBronze:102n,revision:1n,createdTick:0n}}, merchantRows:{buy:props['empty']?[]:merchantOffers('general_tools').map(itemKind=>({itemKind,name:itemDefinition(itemKind)?.displayName??itemKind,unitPrice:ITEM_ECONOMY[itemKind as keyof typeof ITEM_ECONOMY]?.buyPriceBronze??0,maximumQuantity:99,quantity:0})),sell:props['empty']?[]:['apple','wood','stone'].map(itemKind=>({itemKind,name:itemDefinition(itemKind)?.displayName??itemKind,unitPrice:ITEM_ECONOMY[itemKind as keyof typeof ITEM_ECONOMY]?.sellPriceBronze??0,maximumQuantity:20,ownedQuantity:20,quantity:0}))}, questLogEntries:props['empty']?[]:rows.map((row,index)=>({id:row.id,title:row.label,summary:row.detail??'',state:index===1?'complete':'active',pinned:index===0,objectives:[{label:row.label,complete:index===1,progress:`${row.value??0}/20`}],rewards:['100 EXPLORER XP','1 GOLD']})), skills:{tracks:[{track:'explorer',experience:1200n,spentPoints:1,bonusPoints:3,respecCount:1}],ranks:[{nodeId:'trailblazer',rank:1}],balanceBronze:12345n}, skillArtwork:Object.defineProperties({},Object.fromEntries(SKILL_NODE_DEFINITIONS.map(node=>[node.id,{enumerable:true,get:()=>mock.assets?.get(`icon_skill_${node.id}`)}]))), characterAsset: name=>mock.assets?.get(name), character: {playerId:'mara',displayName:'Mara',appearance:{hairKind:'hair_1_brown',shirtKind:'farmer_green',pantsKind:'farmer_white_brown',shoesKind:'brown'},baseAttributes:{str:10,dex:10,con:10,int:10,wis:10,cha:10},resolvedAttributes:{str:12,dex:10,con:10,int:10,wis:10,cha:10},health:8000,maxHealth:10000,mana:5000,maxMana:10000,vigour:9000,maxVigour:10000,tracks:[{track:'farming',experience:1200n}],effects:['Rested'],equipment:[{slot:2,itemKind:'watch',quantity:1}]}, statistics: {statistics: props['empty'] ? [] : [{statisticKind:'time_played',subjectKind:'',value:1220n},{statisticKind:'bronze_earned',subjectKind:'',value:12345n},...['apple','grape','plank','wood','stone','strawberry','beetroot','must'].map(subjectKind=>({statisticKind:'items_obtained',subjectKind,value:1200n}))]}, crafting: id === 'crafting' ? { recipes: props['empty'] ? [] : craftingRecipeBookEntries([], [{ slot: 0, itemKind: 'wood', quantity: 9 }], ['planks','sticks','torch','workbench','fruit_press']).map(entry => ({ id: entry.recipeId, label: `${entry.outputQuantity} ${entry.outputKind}`, detail: !entry.stationAvailable ? 'STATION REQUIRED' : entry.missingIngredients ? 'MISSING INGREDIENTS' : 'READY', pattern: craftingRecipePattern(entry.recipeId, ['planks','sticks','torch','workbench','fruit_press']) ?? [] })), selected: null, pattern: [], output: null } : undefined, feedback: id === 'feedback-overlays' ? [
    { id: 'offer', kind: 'quest', x: 30, y: 25, artwork: () => mock.assets?.get('icon_cf_quest_offer') },
    { id: 'complete', kind: 'quest', x: 70, y: 25, artwork: () => mock.assets?.get('icon_cf_quest_complete') },
    { id: 'hit', kind: 'damage', x: 130, y: 20, amount: 12, progress: 0 },
    { id: 'critical', kind: 'damage', x: 180, y: 20, amount: 24, critical: true, progress: 0 },
  ] : undefined, art: mock.art, inventory: { ...frame, controller, artwork, progress: ['furnace', 'cooking', 'press', 'fermentation'].includes(id) ? props['mode'] === 'active' ? 0.6 : 0 : .6, state: { sealed: props['sealed'] === true,
    processJobPending: props['mode'] === 'batch', processJobReady: props['mode'] === 'batch', processJobLabel: 'COOKED BATCH READY', processJobProgress: .8 },
    status: id === 'barrel' ? { label: props['sealed'] ? 'CURING 60%' : '[S] SEAL 4–24 MATCHING CROPS', progress: .6 }
      : id === 'furnace' ? { label: props['mode'] === 'active' ? 'SMELTING 0:12' : 'ADD INPUTS' }
        : id === 'cooking' ? { label: props['mode'] === 'unlit' ? 'PRESS F TO LIGHT' : props['mode'] === 'active' ? 'COOKING 0:12' : 'ADD RAW FOOD' }
          : id === 'press' ? { label: props['mode'] === 'active' ? 'PRESSING FRUIT 0:12' : 'ADD FRUIT' }
            : id === 'fermentation' ? { label: props['mode'] === 'active' ? 'FERMENTING 0:12 · BOTTLES' : 'ADD 3 MUST · BOTTLES' } : undefined,
    inventoryControls: ['inventory', 'chest', 'barrel', 'furnace', 'cooking', 'press', 'fermentation', 'crafting'].includes(id) ? { backpack: { onSort: () => mock.activate(`${id}:sort:backpack`) }, ...(['chest', 'barrel'].includes(id) ? { entity: { onSort: () => mock.activate(`${id}:sort:entity`) } } : {}) } : undefined,
  }, balance: 124,
    text: id === 'help-book' ? '# Orchard guide\n\nPick [apples](item:apple), prepare your tools, and explore the cellar.\n\n## Working together\n\nTrade supplies and follow the harvest journal.' : props['longLabels'] ? 'A very long orchard description that wraps inside its own clipped frame. '.repeat(8) : 'Welcome to the orchard. Choose an action below.',
    rows, secondaryRows: rows.slice(1), stats: [{ id:'health', label:'Health', value:80, progress:0.8 },{ id:'energy',label:'Energy',value:60,progress:0.6 },{ id:'hunger',label:'Satiety',value:90,progress:0.9 }],
    settings: [{ id:'music',label:'Music',value:0.7 },{ id:'effects',label:'Sound effects',value:true },{ id:'scale',label:'UI scale',value:'2',options:[{ value:'1',label:'1x' },{ value:'2',label:'2x' },{ value:'3',label:'3x' }] }],
    onAction: (action, value) => mock.activate(`${id}:${action}${value === undefined ? '' : `:${JSON.stringify(value)}`}`),
  };
}
