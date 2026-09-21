import { uiBuildPalette, type UiBuildPaletteOptions } from './build-palette.js';
import { uiDelveConfirmation } from './delve-confirmation.js';
import { uiDelveRewards, type UiDelveRewardsModel } from './delve.js';
import { uiChat, type UiChatModel } from './chat.js';
import { chatCommandSuggestions } from '../../chat-command.js';
import { uiUpdateReady } from './update-ready.js';
import { uiCharacterName, type UiCharacterNameModel } from './character-name.js';
import { uiGateway, type UiGatewayModel } from './gateway.js';
import { uiLoadingGateway, type UiLoadingGatewayModel } from './loading-gateway.js';
import { uiDeveloper, type UiDeveloperModel, type UiDeveloperTab } from './developer.js';
import { uiSettings, type UiSettingsModel, type UiSettingsTab } from './settings.js';
import { uiGameMenu, type UiGameMenuModel } from './game-menu.js';
import { uiTrade, type UiTradeOptions } from './trade.js';
import { uiDialogue, type UiDialogueOptions } from './dialogue.js';
import { uiMerchant, type UiMerchantModel, type UiMerchantRow } from './merchant.js';
import { uiHelpBook } from './help-book.js';
import { uiQuestLog, type UiQuestLogOptions } from './quest-log.js';
import { uiSkills, type UiSkillsOptions } from './skills.js';
import { uiCharacter, type UiCharacterOptions } from './character.js';
import { uiStatistics } from './statistics.js';
import type { StatisticsScreenModel } from '../../statistics-screen.js';
import { uiCraftingFrame, type UiCraftingSnapshot } from './crafting-frame.js';
import { uiWorldFeedback, type UiWorldFeedbackEntry } from './world-feedback.js';
import { uiWorldSpeech } from './world-speech.js';
import { uiWorldHint } from './world-hint.js';
import { uiOnlinePlayers } from './online-players.js';
import { uiPurse } from './purse.js';
import { uiStatusEffects, type UiStatusEffect } from './status-effects.js';
import { uiActionNotice } from './action-notice.js';
import { uiNameplates } from './nameplates.js';
import { uiQuestTracker, type UiQuestTrackerEntry } from './quest-tracker.js';
import { uiZoneHeader, uiMinimap } from './hud-chrome.js';
import { uiVitals, type UiVitalValues } from './vitals.js';
import { HOTBAR_SLOT_COUNT, bootstrapContentRegistry } from '@orchard/sim';
import { UI_LAB_MIGRATION_SURFACES, type UiLabMigrationSurfaceId } from '../../ui-lab-catalog.js';
import type { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiTone } from '../tokens.js';
import type { UiKitArt } from './art.js';
import { uiIconButton, type UiIconSource } from './media.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';
import { uiList } from './collections.js';
import { uiBadge, uiTouchControls } from './anchors.js';
import { uiHotbar } from './inventory.js';
import { uiContentFrame, type UiContentFrameOptions } from './content-frame.js';
/** Data and callbacks only: no game connection, engine or host DOM crosses here. */
export interface UiGameRow { readonly id: string; readonly label: string; readonly detail?: string; readonly value?: number | string; readonly progress?: number; readonly icon?: UiIconSource; readonly children?: readonly UiGameRow[] }
export interface UiGameSetting { readonly id: string; readonly label: string; readonly value: boolean | number | string; readonly options?: readonly { readonly value: string; readonly label: string }[] }
export interface UiGameSurfaceOptions {
  readonly id: UiLabMigrationSurfaceId; readonly title?: string; readonly text?: string; readonly rows?: readonly UiGameRow[]; readonly secondaryRows?: readonly UiGameRow[];
  readonly buildPalette?: Pick<UiBuildPaletteOptions, 'model' | 'artwork'>;
  readonly delve?: UiDelveRewardsModel;
  readonly chat?: UiChatModel; readonly chatDraft?: string;
  readonly characterName?: UiCharacterNameModel;
  readonly gateway?: UiGatewayModel; readonly gatewayLoading?: UiLoadingGatewayModel;
  readonly developer?: UiDeveloperModel; readonly developerTab?: UiDeveloperTab;
  readonly gameSettings?: UiSettingsModel; readonly settingsTab?: UiSettingsTab;
  readonly gameMenu?: UiGameMenuModel;
  readonly feedback?: readonly UiWorldFeedbackEntry[];
  readonly effects?: readonly UiStatusEffect[];
  readonly quests?: readonly UiQuestTrackerEntry[]; readonly selectedSlot?: number; readonly vitals?: UiVitalValues; readonly stats?: readonly UiGameRow[]; readonly settings?: readonly UiGameSetting[]; readonly progress?: number; readonly balance?: number; readonly loading?: boolean;
  readonly trade?: UiTradeOptions['model']; readonly dialogue?: UiDialogueOptions['model']; readonly dialoguePortrait?: UiDialogueOptions['portrait']; readonly merchantRows?: Readonly<Record<'buy'|'sell',readonly UiMerchantRow[]>>; readonly questLogEntries?: UiQuestLogOptions['entries']; readonly skills?: UiSkillsOptions['model']; readonly skillArtwork?: UiSkillsOptions['artwork']; readonly characterAsset?: UiCharacterOptions['asset']; readonly character?: UiCharacterOptions['model']; readonly renderCharacterPortrait?: UiCharacterOptions['renderPortrait']; readonly statistics?: StatisticsScreenModel; readonly crafting?: UiCraftingSnapshot; readonly inventory?: UiContentFrameOptions; readonly portrait?: UiElement; readonly minimap?: UiElement; readonly art?: UiKitArt;
  readonly onAction?: (action: string, value?: unknown) => void; readonly onClose?: () => void; readonly layout?: UiStyle;
}
/** These exact compositions are registered in the migration gallery before a
 * live host adopts them. The host owns state and interprets action identifiers. */
export function uiGameSurface(options: UiGameSurfaceOptions): UiElement {
  const catalog = UI_LAB_MIGRATION_SURFACES.find(surface => surface.id === options.id)!;
  const rows = options.rows ?? [];
  const invoke = (action: string, value?: unknown) => options.onAction?.(action, value);
  const action = (label: string, id = label.toLowerCase().replaceAll(' ', '-'), tone: UiTone = 'neutral') => uiButton({ label, tone, onPress: () => invoke(id) });
  const list = (items: readonly UiGameRow[], label = 'Entries') => uiList({ label, items, key: row => row.id, render: row => uiText(`${row.label}${row.detail ? ` — ${row.detail}` : ''}`, { overflow: 'ellipsis' }), onSelect: (_keys, row) => invoke('select', row.id), onActivate: row => invoke('activate', row.id) });
  const carried = () => options.inventory ? uiHotbar({ container: options.inventory.aliases.hotbar ?? 'hotbar', count: HOTBAR_SLOT_COUNT, selected: options.selectedSlot, stack: index => options.inventory?.controller?.model.stack({ container: options.inventory.aliases.hotbar ?? 'hotbar', index }) ?? null, onSelect: index => invoke('select-hotbar', index), artwork: options.inventory.artwork }) : uiText('No carried-item data');
  const close = () => { options.onClose?.(); invoke('close'); surface.setStyle({ visible: false }); };
  let children: UiElement[] = [];
  let surface: UiElement;
  switch (options.id) {
    case 'build-palette': {
      if (!options.buildPalette) return uiText('No construction data');
      let model = options.buildPalette.model;
      const palette = uiBuildPalette({ ...options.buildPalette, layout: options.layout,
        onSelect: selection => { model = { ...model, selection }; palette.updateBuildPalette(model); invoke('select-build', selection); },
        onPurchase: kind => invoke('purchase-upgrade', kind) });
      return palette.setProps({ migrationSurface: options.id });
    }
    case 'delve-confirmation': return uiDelveConfirmation({onBegin:()=>invoke('begin-delve'),onCancel:()=>invoke('cancel'),layout:options.layout}).setProps({migrationSurface:options.id});
    case 'delve-rewards': return !options.delve ? uiText('No Delve reward data') : uiDelveRewards({model:options.delve,onChoose:slot=>invoke('choose-boon',slot),onLeaveShop:()=>invoke('leave-shop'),layout:options.layout}).setProps({migrationSurface:options.id});
    case 'statistics': return uiStatistics({model:options.statistics ?? {statistics:[]},onClose:()=>invoke('close'),onNavigate:page=>invoke('navigate',page),layout:options.layout}).setProps({migrationSurface:options.id});
    case 'inventory': case 'chest': case 'barrel': case 'furnace': case 'cooking': case 'press': case 'fermentation': case 'crafting':
      if (options.inventory) {
        if (options.id === 'crafting') {
          let snapshot: UiCraftingSnapshot = options.crafting ?? { recipes: rows.map(row => ({ id: row.id, label: row.label, detail: row.detail })), selected: null, pattern: [], output: null };
          const crafting = uiCraftingFrame({ ...options.inventory, crafting: snapshot,
            onRecipe: id => { const selected = snapshot.selected === id ? null : id; snapshot = { ...snapshot, selected, pattern: selected ? snapshot.recipes.find(row => row.id === selected)?.pattern ?? [] : [] }; crafting.updateCrafting(snapshot); invoke('recipe', id); }, onRecipeFilter: query => invoke('recipe-filter', query), onCraft: all => invoke('craft', all), onClose: close, layout: options.layout });
          surface = crafting; surface.setProps({ migrationSurface: options.id }); return surface;
        }
        surface = uiContentFrame({ ...options.inventory, onClose: close, onInvoke: id => invoke(id), renderPane: pane => options.inventory?.renderPane?.(pane) ?? (pane.kind === 'recipe_list' ? list(rows, 'Recipes') : undefined), layout: options.layout }); surface.setProps({ migrationSurface: options.id }); return surface;
      }
      children = [uiText('Container data is unavailable.'), action('Retry')]; break;
    case 'gateway': {
      if (options.gatewayLoading) return uiLoadingGateway({model:options.gatewayLoading,version:'0.2.3',layout:options.layout}).setProps({migrationSurface:options.id});
      let model:UiGatewayModel=options.gateway??{localPreview:false,signedIn:false,profiles:[],selected:0,message:'SIGN IN TO ENTER THE ORCHARD',busy:false};
      const gateway=uiGateway({model,layout:options.layout,
        onSelectProfile:index=>{model={...model,selected:index};gateway.updateGateway(model);invoke('select-profile',index);},
        onAction:(action,name)=>{
          if(action==='toggle-preview')model={...model,localPreview:!model.localPreview};
          else if(action==='sign-out')model={...model,signedIn:false};
          else model={...model,message:`${action.toUpperCase()}${name?` · ${name}`:''}`};
          gateway.updateGateway(model);invoke(action,name);
        },
      });
      return gateway.setProps({migrationSurface:options.id});
    }
    case 'character-name': {
      const name = uiCharacterName({ model: options.characterName, layout: options.layout, onSubmit: value => invoke('create', value) });
      name.editor.setValue('Mara'); return name.setProps({migrationSurface:options.id});
    }
    case 'update-ready': return uiUpdateReady({onRefresh:()=>invoke('refresh'),onLater:()=>invoke('continue'),layout:options.layout}).setProps({migrationSurface:options.id});
    case 'zone-minimap': {
      let zoneCollapsed = false, mapCollapsed = false, zoom = 2;
      const chrome = uiFlex({ gap: 8, width: 'grow', height: 'grow' });
      const rebuild = () => {
        if (options.minimap?.parent) options.minimap.parent.remove(options.minimap);
        for (const child of [...chrome.children]) child.dispose();
        chrome.replaceChildren([
          uiZoneHeader({ title: options.title ?? 'Sanctuary', onlineCount: rows.length, collapsed: zoneCollapsed,
            onToggle: () => { zoneCollapsed = !zoneCollapsed; invoke('collapse', zoneCollapsed); rebuild(); }, onPlayers: () => invoke('online-players'),
            layout: { width: 'grow' } }),
          uiMinimap({ collapsed: mapCollapsed, zoom, content: options.minimap,
            onToggle: () => { mapCollapsed = !mapCollapsed; invoke('map', mapCollapsed); rebuild(); },
            onZoom: value => { zoom = value; invoke('map-zoom', value); rebuild(); }, layout: { width: 'grow', height: 'grow' } }),
        ]);
      };
      rebuild(); children = [chrome]; break;
    }
    case 'hotbar-vitals': children = [uiVitals({ values: options.vitals ?? { health: 80, maxHealth: 100, mana: 60, maxMana: 100, vigour: 90, maxVigour: 100 }, portrait: options.portrait }), carried(), uiPurse({ balance: BigInt(options.balance ?? 0), onOpen: () => invoke('inventory'), layout: { height: uiFixed(24), shrink: 0 } }), uiFlex({ direction: 'row', gap: 4 }, [uiIconButton({ cf: 'wrench' }, { label: 'Crafting', tone: 'primary', activateOn: 'down', onPress: () => invoke('crafting') }), action('Inventory', 'inventory')])]; break;
    case 'target-effects': children = [uiText(options.text ?? 'Training target'), uiVitals({ values: options.vitals ?? { health: 65, maxHealth: 100 }, mirrored: true, portrait: options.portrait }),
      uiStatusEffects({ ticksPerSecond: 20, effects: options.effects ?? [
        { id: 'winded', name: 'Winded', icon: { cf: 'lightning' }, tone: 'danger', remainingTicks: 200, durationTicks: 1200 },
        { id: 'tea', name: 'Orchard tea', icon: { lucide: 'sprout' }, tone: 'success', remainingTicks: 900, durationTicks: 1200 },
        { id: 'rested', name: 'Well rested', icon: { cf: 'heart' }, tone: 'success', remainingTicks: 2400, durationTicks: 2400 },
      ] }), action('Clear target', 'clear-target')]; break;
    case 'chat': {
      let model:UiChatModel=options.chat??{open:true,collapsed:false,unread:false,hovered:false,touch:false,blocked:false,lines:rows.map(row=>({id:row.id,text:`[General] ${row.label}: ${row.detail??''}`,arrivedAt:0})),suggestions:[],suggestionIndex:0};
      const refresh=()=>{model={...model,suggestions:chatCommandSuggestions(chat.editor.snapshot().value,['Mara','Toby'],false,'Mara')};chat.updateChat(model);};
      const chat=uiChat({model,layout:options.layout,onSubmit:value=>{invoke('send',value);chat.editor.setValue('');model={...model,lines:[...model.lines,{id:`sent-${model.lines.length}`,text:`[General] You: ${value}`,arrivedAt:0}]};refresh();},onChange:refresh,
        onToggle:()=>{model={...model,collapsed:!model.collapsed,unread:false};chat.updateChat(model);invoke('toggle');},
        onSuggestionIndex:index=>{model={...model,suggestionIndex:index};chat.updateChat(model);},
        onComplete:index=>{const suggestion=model.suggestions[index];if(suggestion){chat.editor.setValue(suggestion.completion);refresh();invoke('complete',suggestion.completion);}},onMove:delta=>invoke('move',delta),onMoveEnd:()=>invoke('move-end')});
      chat.editor.setValue(options.chatDraft??'');refresh();return chat.setProps({migrationSurface:options.id});
    }
    case 'quest-tracker': {
      let collapsed = false;
      const tracker = uiFlex({ width: 'grow', height: 'grow' });
      const rebuild = () => {
        for (const child of [...tracker.children]) child.dispose();
        tracker.append(uiQuestTracker({ entries: options.quests ?? rows.map(row => ({ id: row.id, title: row.label, complete: row.progress === 1, objectives: row.detail ? [row.detail] : [] })), collapsed,
          onToggle: () => { collapsed = !collapsed; invoke('collapse', collapsed); rebuild(); },
          onOpenQuest: id => invoke('open-quest', id), layout: { width: 'grow', height: 'grow' },
        }));
      };
      rebuild(); children = [tracker]; break;
    }
    case 'online-players': return uiOnlinePlayers({ players: rows.map((row, index) => ({ id: row.id, label: `${row.label}${row.detail ? ` · ${row.detail}` : ''}`, manageable: index > 0 })), onClose: () => invoke('close'), onCycleRole: id => invoke('cycle-role', id), onRemove: id => invoke('remove-player', id), layout: options.layout }).setProps({ migrationSurface: options.id });
    case 'feedback-overlays': children = [uiWorldFeedback({ entries: options.feedback ?? [], layout: { height: uiFixed(50), shrink: 0 } }), uiWorldHint({ hint: { x: 160, y: 160, title: 'APPLE TREE', lines: ['WATERED - 2 MIN LEFT'], tone: 'success', progress: .6 }, layout: { height: uiFixed(170), shrink: 0 } }), uiActionNotice({ id: 'gallery.skill-notice', message: 'NEW FARMING SKILL POINT · OPEN', tone: 'success', onOpen: () => invoke('skills'), onDismiss: () => invoke('dismiss-skill-notice') }), uiNameplates({ labels: [{ id: 'speaker', x: 120, y: 40, text: options.title ?? 'Mara' }, { id: 'offline', x: 120, y: 90, text: 'Cellar keeper', offline: true }], layout: { width: 'grow', height: uiFixed(100), shrink: 0 } }), uiWorldSpeech({ messages: [{ id: 'say', x: 100, y: 70, text: 'Meet me at the orchard.', kind: 'say' }, { id: 'tell', x: 270, y: 130, text: 'A private message.', kind: 'tell' }], layout: { height: uiFixed(140), shrink: 0 } }), ...rows.map(row => uiBadge({ label: row.label, tone: 'success' })), action('Dismiss feedback', 'dismiss')]; break;
    case 'touch-controls': children = [uiTouchControls({ placement: 'hud', layout: { height: uiFixed(180), shrink: 0 }, onDirection: direction => invoke('move',direction), onAction: value => invoke(value) }), action('Menu', 'menu')]; break;
    case 'character': {
      if (!options.character) { children = [uiText('Waiting for character data.')]; break; }
      let model = options.character;
      const character = uiCharacter({ model, asset: options.characterAsset, artwork: options.inventory?.artwork, renderPortrait: options.renderCharacterPortrait,
        onAppearance: appearance => { model = { ...model, appearance }; character.updateCharacter(model); invoke('appearance', appearance); },
        onNavigate: page => invoke('navigate', page), onClose: () => invoke('close'), layout: options.layout,
      }); return character.setProps({ migrationSurface: options.id });
    }
    case 'skills': return uiSkills({model:options.skills??{nodes:[],tracks:[],ranks:[],balanceBronze:0n},artwork:options.skillArtwork,purchase:id=>invoke('learn',id),reset:track=>invoke('reset',track),onNavigate:page=>invoke('navigate',page),onClose:()=>invoke('close'),layout:options.layout}).setProps({migrationSurface:options.id});
    case 'quest-log': return uiQuestLog({entries:options.questLogEntries??[],setPinned:(id,pinned)=>invoke('track',{id,pinned}),drop:id=>invoke('drop',id),onClose:()=>invoke('close'),layout:options.layout}).setProps({migrationSurface:options.id});
    case 'help-book': return uiHelpBook({art:options.art,onClose:()=>invoke('close'),layout:options.layout}).setProps({migrationSurface:options.id});
    case 'npc-dialogue': return uiDialogue({model:options.dialogue??{id:'greeting',speaker:options.title??'Mara',body:options.text??'',choices:rows.map(row=>({id:row.id,label:row.label}))},portrait:options.dialoguePortrait,choose:id=>invoke('choice',id),onClose:()=>invoke('close'),onLink:target=>invoke('link',target),layout:options.layout}).setProps({migrationSurface:options.id});
    case 'merchant-shop': {
      const stock=options.merchantRows??{buy:[],sell:[]};const quantities={buy:new Map<string,number>(),sell:new Map<string,number>()};
      let tab:'buy'|'sell'='buy',filter='',pending=false;
      const model=():UiMerchantModel=>{const all=stock[tab].map(row=>({...row,quantity:quantities[tab].get(row.itemKind)??0})),total=all.reduce((sum,row)=>sum+BigInt(row.unitPrice)*BigInt(row.quantity),0n),balance=BigInt(options.balance??12345);return{speaker:'Marlow',tab,filter,pending,rows:all.filter(row=>`${row.name} ${row.itemKind}`.toLowerCase().includes(filter.toLowerCase())),balanceBronze:balance,totalBronze:total,canCommit:!pending&&all.some(row=>row.quantity>0)&&(tab==='sell'||total<=balance)};};
      const refresh=()=>merchant.updateMerchant(model());
      const merchant=uiMerchant({model:model(),artwork:options.inventory?.artwork,onTab:value=>{tab=value;refresh();invoke('tab',value);},onFilter:value=>{filter=value;refresh();invoke('search',value);},onQuantity:(id,value)=>{quantities[tab].set(id,value);refresh();invoke('quantity',{id,value});},onCommit:()=>{const submitted=tab;invoke('commit',{tab,lines:[...quantities[tab]]});pending=true;refresh();queueMicrotask(()=>{quantities[submitted].clear();pending=false;refresh();});},onBack:()=>invoke('back'),onClose:()=>invoke('close'),layout:options.layout});return merchant.setProps({migrationSurface:options.id});
    }
    case 'player-trade': {
      let model:UiTradeOptions['model']=options.trade??{contentRegistry:bootstrapContentRegistry(),identityHex:'mara',requesterName:'Mara',recipientName:'Toby',walletBronze:12345n,offers:[],inventorySlots:[],session:{id:'lab-trade',requester:{toHexString:()=> 'mara'},recipient:{toHexString:()=> 'toby'},state:'active',requesterAccepted:false,recipientAccepted:false,requesterBronze:0n,recipientBronze:0n,revision:0n,createdTick:0n}};
      const refresh=()=>trade.updateTrade(model);
      const trade=uiTrade({model,artwork:options.inventory?.artwork,layout:options.layout,callbacks:{acceptRequest:id=>{model={...model,session:{...model.session,state:'active'}};refresh();invoke('accept-request',id);},declineRequest:id=>invoke('decline',id),cancel:id=>invoke('cancel',id),offerItem:(id,index,slot,quantity)=>{const item=model.inventorySlots.find(row=>row.slot===index);if(item)model={...model,offers:[...model.offers,{id:`offer-${slot}`,tradeId:id,owner:{toHexString:()=>model.identityHex},slot,itemKind:item.itemKind,quantity,durability:item.durability??0,lit:item.lit??false}],session:{...model.session,revision:model.session.revision+1n,requesterAccepted:false,recipientAccepted:false}};refresh();invoke('offer',{index,slot,quantity});},removeItem:(id,slot)=>{model={...model,offers:model.offers.filter(offer=>offer.owner.toHexString()!==model.identityHex||offer.slot!==slot),session:{...model.session,revision:model.session.revision+1n,requesterAccepted:false,recipientAccepted:false}};refresh();invoke('remove',{id,slot});},offerBronze:(id,amount)=>{model={...model,session:{...model.session,requesterBronze:amount,revision:model.session.revision+1n,requesterAccepted:false,recipientAccepted:false}};refresh();invoke('money',{id,amount:String(amount)});},setAccepted:(id,accepted,revision)=>{model={...model,session:{...model.session,requesterAccepted:accepted}};refresh();invoke('accept',{id,accepted,revision:String(revision)});}}});return trade.setProps({migrationSurface:options.id});
    }
    case 'game-menu': return uiGameMenu({model:options.gameMenu??{},onAction:action=>invoke(action),layout:options.layout}).setProps({migrationSurface:options.id});
    case 'settings': {
      let model=options.gameSettings??{audioVolumes:{master:.8,music:.7,sfx:.35},nameplatesVisible:true,lightingModel:'classic'};
      const restore={...model.audioVolumes};const refresh=()=>settings.updateSettings(model);
      const volume=(bus:'master'|'music'|'sfx',value:number)=>{if(value>.001)restore[bus]=value;model={...model,audioVolumes:{...model.audioVolumes,[bus]:value}};refresh();invoke('volume',{bus,value});};
      const settings=uiSettings({model,tab:options.settingsTab,layout:options.layout,onTab:tab=>invoke('tab',tab),onVolume:volume,onMute:bus=>volume(bus,model.audioVolumes[bus]>.001?0:Math.max(.05,restore[bus])),
        onBackground:(bus,value)=>{model={...model,audioBackground:{music:model.audioBackground?.music??false,sounds:model.audioBackground?.sounds??false,[bus]:value}};refresh();invoke('background',{bus,value});},
        onNameplates:value=>{model={...model,nameplatesVisible:value};refresh();invoke('nameplates',value);},onLighting:value=>{model={...model,lightingModel:value};refresh();invoke('lighting',value);},onBack:()=>invoke('back')});
      return settings.setProps({migrationSurface:options.id});
    }
    case 'developer': {
      let model=options.developer??{canAdministerWorld:true,timeFraction:.25,dateLabel:'SPRING 1',timeLabel:'06:00',weatherMode:'auto',raining:false,windDirectionMode:'auto',windDirectionLabel:'SE'};
      const refresh=()=>developer.updateDeveloper(model);
      const developer=uiDeveloper({model,tab:options.developerTab,layout:options.layout,onBack:()=>invoke('back'),onTab:tab=>invoke('tab',tab),onTime:value=>{model={...model,timeFraction:value};refresh();invoke('time',value);},onAction:action=>{
        if(action==='lighting-effects')model={...model,lightingEffectsDisabled:!model.lightingEffectsDisabled};
        else if(action==='ore-preview')model={...model,cellarOrePreview:!model.cellarOrePreview};
        else if(action==='weather')model={...model,weatherMode:model.raining?'clear':'rain',raining:!model.raining};
        else if(action==='wind')model={...model,windDirectionMode:model.windDirectionMode==='auto'?'north':'auto'};
        refresh();invoke(action);
      }});return developer.setProps({migrationSurface:options.id});
    }
  }
  surface = uiFrame({ header: { title: options.title ?? catalog.title, closable: catalog.closable, onClose: close, draggable: catalog.closable }, resizable: catalog.closable ? { handles: 'all', min: { width: 96, height: 96 } } : undefined,
    layout: { width: 'grow', height: 'grow', gap: 8, ...options.layout }, children: [uiScrollArea({ width: 'grow', height: 'grow', gap: 8 }, children)] });
  surface.setProps({ migrationSurface: options.id }); return surface;
}
