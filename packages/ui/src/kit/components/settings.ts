import type { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiSwitch, uiSlider } from './forms.js';
import { uiButton } from './button.js';
import { uiSelect } from './select.js';
import { uiWindow } from './window.js';
import { uiMenuTab, uiMuteButton, uiSettingRow } from './social.js';
import { uiPageHeading } from './character-book.js';
import { uiPageScroll } from './quest-log.js';

export const UI_SETTINGS_TABS = ['gameplay', 'controls', 'video', 'audio', 'interface', 'accessibility'] as const;
export type UiSettingsTab = (typeof UI_SETTINGS_TABS)[number];
export type UiAudioBus = 'master' | 'music' | 'sfx';
export interface UiSettingsModel {
  readonly audioVolumes: Readonly<Record<UiAudioBus, number>>;
  readonly audioBackground?: { readonly music: boolean; readonly sounds: boolean };
  readonly nameplatesVisible?: boolean;
  readonly fullscreen?: boolean;
  readonly lightingModel?: 'classic' | 'unified';
  readonly lightingMode?: 'basic' | 'classic' | 'dynamic';
  readonly worldScale?: '1x' | '2x' | 'native';
  readonly presentationCap?: 'off' | '30hz';
  readonly experimentalWebGL?: boolean;
  readonly lightingFallbackReason?: string | null;
  readonly touchPreferences?: { readonly swapped: boolean; readonly bottomOffset: number };

}
export interface UiSettingsOptions {
  readonly model: UiSettingsModel; readonly tab?: UiSettingsTab; readonly layout?: UiStyle;
  readonly onTab?: (tab: UiSettingsTab) => void;
  readonly onVolume: (bus: UiAudioBus, value: number) => void;
  readonly onMute: (bus: UiAudioBus) => void;
  readonly onBackground: (bus: 'music' | 'sounds', value: boolean) => void;
  readonly onNameplates: (visible: boolean) => void;
  readonly onLighting: (value: 'classic' | 'unified') => void;
  readonly onLightingMode?: (mode: 'basic' | 'classic' | 'dynamic') => void;
  readonly onWorldScale?: (scale: '1x' | '2x' | 'native') => void;
  readonly onPresentationCap?: (cap: 'off' | '30hz') => void;
  readonly onExperimentalWebGL?: (enabled: boolean) => void;
  readonly onTouchPreferences?: (value: { readonly swapped: boolean; readonly bottomOffset: number }) => void;
  readonly onBack: () => void;
}
export interface UiSettingsElement extends UiElement {
  updateSettings(model: UiSettingsModel): void;
  toggleNameplates(): void;
  selectSettingsTab(tab: UiSettingsTab): void;
  readonly selectedTab: UiSettingsTab;
  /** Fit to the viewport: short screens scroll the page rather than the window; narrow ones show glyph-only tabs. */
  setSettingsViewport(viewportWidth: number, viewportHeight: number): void;
}

const TAB_FACES: Record<UiSettingsTab, readonly [string, string]> = {
  gameplay: ['Gameplay', 'play'], controls: ['Controls', 'key_a'], video: ['Video', 'square'],
  audio: ['Audio', 'star'], interface: ['Interface', 'pointer'], accessibility: ['Access', 'heart'],
};
const PANEL = { width: 252, height: 204 } as const;
/** Approved settings: the legacy vertical tab column (green active tab with its glyph, Back at the foot)
 * beside a parchment page of rows, coloured switches and mute buttons. Working settings commit
 * immediately; reserved preferences stay visible but disabled. */
export function uiSettings(options: UiSettingsOptions): UiSettingsElement {
  let selected = options.tab ?? 'gameplay', currentModel = options.model, compact = false;
  const toggle = (id: string | undefined, label: string, onChange?: (value: boolean) => void, disabled = false) =>
    uiSwitch({ id, label, bare: true, coloured: true, disabled, onChange });
  const volumes = new Map<UiAudioBus, { slider: UiElement; mute: UiElement; value: UiElement }>();
  const audio = (['master', 'music', 'sfx'] as const).map(bus => {
    const label = bus === 'sfx' ? 'Effects' : bus === 'master' ? 'Master' : 'Music';
    const slider = uiSlider({ id: `settings.volume.${bus}`, label: `${label.toUpperCase()} VOLUME`, min: 0, max: 1, step: .01,
      onChange: value => options.onVolume(bus, value), layout: { grow: 1, basis: uiFixed(64), height: uiFixed(26) } });
    const value = uiText('', { align: 'right', layout: { width: uiFixed(26) } });
    const mute = uiMuteButton({ id: `settings.mute.${bus}`, label, kind: bus === 'music' ? 'music' : 'sound', muted: () => currentModel.audioVolumes[bus] <= .001, onToggle: () => options.onMute(bus) });
    volumes.set(bus, { slider, mute, value });
    return uiFlex({ direction: 'row', gap: 6, align: 'center', alignSelf: 'stretch', shrink: 0 }, [mute, uiText(label, { layout: { width: uiFixed(52) } }), slider, value]);
  });
  const music = toggle('settings.background.music', 'MUSIC IN BACKGROUND', value => options.onBackground('music', value));
  const sounds = toggle('settings.background.sounds', 'SOUNDS IN BACKGROUND', value => options.onBackground('sounds', value));
  const nameplates = toggle('settings.nameplates', 'PLAYER NAMEPLATES', options.onNameplates);
  const display = uiText('');
  const lighting = uiSelect({id:'settings.lighting',label:'Lighting model',options:[{value:'classic',label:'CLASSIC'},{value:'unified',label:'UNIFIED V2'}],onChange:value=>{if(value==='classic'||value==='unified')options.onLighting(value);}});
  const lightingMode = uiSelect({ id: 'settings.lighting-mode', label: 'Lighting', options: ['basic', 'classic', 'dynamic'].map(value => ({ value, label: value.toUpperCase() })),
    onChange: value => { if (value === 'basic' || value === 'classic' || value === 'dynamic') options.onLightingMode?.(value); } });
  const worldScale = uiSelect({ id: 'settings.world-scale', label: 'World scale', options: ['1x', '2x', 'native'].map(value => ({ value, label: value.toUpperCase() })),
    onChange: value => { if (value === '1x' || value === '2x' || value === 'native') options.onWorldScale?.(value); } });
  const cap = toggle('settings.presentation-cap', '30 HZ CAP', enabled => options.onPresentationCap?.(enabled ? '30hz' : 'off'));
  const webgl = toggle('settings.experimental-webgl', 'EXPERIMENTAL WEBGL RENDERER', enabled => options.onExperimentalWebGL?.(enabled));
  const fallback = uiText('', { wrap: true, layout: { alignSelf: 'stretch' } });
  const swap = toggle('settings.touch-swap', 'SWAP MOVEMENT / ACTIONS',
    swapped => options.onTouchPreferences?.({ ...(currentModel.touchPreferences ?? { swapped: false, bottomOffset: 0 }), swapped }));
  const offsetValue = uiText('', { align: 'right', layout: { width: uiFixed(26) } });
  const offset = uiSlider({ id: 'settings.touch-offset', label: 'BOTTOM OFFSET', min: 0, max: 120, step: 1, layout: { width: uiFixed(96), height: uiFixed(26) },
    onChange: bottomOffset => options.onTouchPreferences?.({ ...(currentModel.touchPreferences ?? { swapped: false, bottomOffset: 0 }), bottomOffset: Math.round(bottomOffset) }) });
  const row = (label: string, control: UiElement, hint?: string) => uiSettingRow(label, control, hint);
  const touch = uiFlex({ direction: 'column', gap: 2, alignSelf: 'stretch', shrink: 0 }, [row('Swap movement and actions', swap),
    row('Bottom offset', uiFlex({ direction: 'row', gap: 4, align: 'center' }, [offset, offsetValue])), uiText('Pinch the world to zoom.', { role: 'caption', wrap: true, layout: { alignSelf: 'stretch' } })]);
  const rendering = uiFlex({ direction: 'column', gap: 2, alignSelf: 'stretch', shrink: 0 }, [row('Lighting', lightingMode), row('World scale', worldScale), row('30 Hz frame cap', cap), row('Experimental WebGL', webgl), fallback]);
  // Reserved preferences read as settings with their current value, greyed until they are implemented.
  const reserved = (rows: readonly (readonly [string, string])[]) => rows.map(([label, value]) => row(label, uiButton({ label: value, size: 'sm', disabled: true }), 'Coming later'));
  const page = (children: readonly UiElement[]) => uiFlex({ direction: 'column', gap: 2, alignSelf: 'stretch' }, children);
  const pages: Record<UiSettingsTab, UiElement> = {
    gameplay: page([row('Player nameplates', nameplates, 'Same as pressing N'),
      ...([['Show tutorial hints', true], ['Confirm rare item drops', true], ['Auto-sort pickups', false], ['Hold to harvest', false]] as const).map(([label, value]) => {
        const control = toggle(undefined, label.toUpperCase(), undefined, true); control.setProps({ value }, false); return row(label, control, 'Coming later'); })]),
    controls: page([touch, ...reserved([['Move', 'WASD / stick'], ['Interact', 'E / south'], ['Inventory', 'I / west'], ['Nameplates', 'N'], ['Chat', 'Enter'], ['Pause', 'Esc / start']])]),
    video: page([display, uiFlex({ direction: 'column', gap: 2, alignSelf: 'stretch' }, [row('Lighting model', lighting)]), rendering,
      ...reserved([['Pixel scaling', 'Integer'], ['World zoom', 'Auto'], ['UI scale', 'Auto'], ['Weather detail', 'High']])]),
    audio: page([...audio, row('Music in background', music), row('Sounds in background', sounds)]),
    interface: page(reserved([['HUD visibility', 'Full'], ['Minimap', 'Expanded'], ['Chat timestamps', 'Off'], ['Tooltip delay', 'Short'], ['Item labels', 'On'], ['UI safe area', 'Auto']])),
    accessibility: page(reserved([['Reduced motion', 'Off'], ['Flash reduction', 'Off'], ['High contrast', 'Off'], ['Chat text size', 'Normal'], ['Colour filter', 'None'], ['Hold assist', 'Off']])),
  };
  const heading = uiFlex({ alignSelf: 'stretch', shrink: 0 });
  // The page reserves its wood scroll rail only when its rows overflow.
  const pageHost = uiFlex({ direction: 'column', alignSelf: 'stretch' });
  const scroll = uiPageScroll({ id: 'settings.page', label: 'Settings page' }, pageHost);
  scroll.setProps({ touchScroll: true });
  const panel = uiFrame({ style: 'parchment_plain', padding: 8, layout: { direction: 'column', gap: 4, width: uiFixed(PANEL.width), height: uiFixed(PANEL.height), maxWidth: { mode: 'percent', fraction: 1 } }, children: [heading, scroll] });
  const tabs = uiFlex({ id: 'settings.pages', direction: 'column', gap: 2, shrink: 0 });
  // The tab column matches the page's height; on short screens it scrolls too, so the window never does.
  const tabColumn = uiScrollArea({ width: uiFixed(88), height: uiFixed(PANEL.height), shrink: 0, padding: 0 }, [tabs]);
  tabColumn.setProps({ touchScroll: true });
  const buildTabs = () => {
    const focused = tabs.children.some(tab => tab.props['focused']) ? selected : null;
    for (const child of [...tabs.children]) child.dispose();
    tabs.replaceChildren([...UI_SETTINGS_TABS.map(id => uiMenuTab({ id: `settings.pages:tab:${id}`, label: TAB_FACES[id][0], glyph: TAB_FACES[id][1], active: id === selected, iconOnly: compact, onPress: () => selectSettingsTab(id) })),
      uiFlex({ height: uiFixed(8) }, []), uiMenuTab({ id: 'settings.back', label: 'Back', glyph: 'back', active: false, iconOnly: compact, onPress: options.onBack })]);
    if (focused) tabs.children.find(tab => tab.id === `settings.pages:tab:${selected}`)?.requestFocus();
  };
  const showPage = () => {
    for (const child of [...heading.children]) child.dispose();
    heading.append(uiPageHeading(TAB_FACES[selected][0] === 'Access' ? 'Accessibility' : TAB_FACES[selected][0], undefined, { rule: false }));
    pageHost.replaceChildren([pages[selected]]); scroll.scroll.y = 0;
  };
  function selectSettingsTab(tab: UiSettingsTab): void {
    const changed = tab !== selected; selected = tab;
    if (changed) options.onTab?.(selected);
    buildTabs(); showPage();
  }
  const frame = uiWindow({ id: 'game.settings', title: 'SETTINGS', closeLabel: 'Close settings', onClose: options.onBack, layout: { direction: 'row', gap: 8, align: 'start' }, children: [tabColumn, panel] });
  if (options.layout) frame.setStyle(options.layout);
  const updateSettings=(model:UiSettingsModel)=>{
    currentModel = model;
    touch.setStyle({ visible: options.onTouchPreferences !== undefined });
    swap.setProps({ value: model.touchPreferences?.swapped ?? false }, false);
    offset.setProps({ value: model.touchPreferences?.bottomOffset ?? 0 }, false);
    offsetValue.setProps({ text: String(model.touchPreferences?.bottomOffset ?? 0) });
    rendering.setStyle({ visible: options.onLightingMode !== undefined });
    lighting.parent?.setStyle({ visible: options.onLightingMode === undefined });
    const mode = model.lightingMode ?? 'classic', scale = model.worldScale ?? 'native';
    lightingMode.children[0]!.setProps({ value: mode, label: mode.toUpperCase() });
    worldScale.children[0]!.setProps({ value: scale, label: scale.toUpperCase() });
    cap.setProps({ value: model.presentationCap === '30hz' }, false);
    webgl.setProps({ value: model.experimentalWebGL === true }, false);
    fallback.setProps({ text: model.lightingFallbackReason ?? '' }).setStyle({ visible: Boolean(model.lightingFallbackReason) });
    for(const [bus,control] of volumes){const value=model.audioVolumes[bus];control.slider.setProps({value},false);control.value.setProps({text:`${Math.round(value*100)}%`});control.mute.setProps({label:value<=.001?'UNMUTE':'MUTE',tone:value<=.001?'danger':'success'});control.mute.label=`${value<=.001?'Unmute':'Mute'} ${bus==='sfx'?'Effects':bus==='master'?'Master':'Music'}`;control.mute.invalidate();}
    music.setProps({value:model.audioBackground?.music??false},false);sounds.setProps({value:model.audioBackground?.sounds??false},false);nameplates.setProps({value:model.nameplatesVisible??true},false);
    display.setProps({text:`Display mode: ${model.fullscreen?'fullscreen':'windowed'}`});
    const value=model.lightingModel??'classic';lighting.children[0]!.setProps({value,label:value==='classic'?'CLASSIC':'UNIFIED V2'});
  };
  const setSettingsViewport = (viewportWidth: number, viewportHeight: number) => {
    // 8px viewport margin, 48px of window chrome and ribbon.
    const height = uiFixed(Math.max(96, Math.min(PANEL.height, Math.floor(viewportHeight) - 56)));
    panel.setStyle({ height }); tabColumn.setStyle({ height });
    const narrow = viewportWidth < 420;
    if (narrow !== compact) { compact = narrow; tabColumn.setStyle({ width: uiFixed(compact ? 22 : 88) }); buildTabs(); }
  };
  buildTabs(); showPage(); updateSettings(options.model);
  return Object.defineProperty(Object.assign(frame,{updateSettings,setSettingsViewport,toggleNameplates(){nameplates.hooks.onKey?.({key:'Enter'},nameplates);},selectSettingsTab}),'selectedTab',{get:()=>selected}) as unknown as UiSettingsElement;
}
