import type { LoadedAsset } from '../../assets.js';
import { scrollUiElement } from '../layout/scroll.js';
import { UiElement } from '../runtime/element.js';
import { CanvasTextEditor } from '../runtime/text-editor.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiInput } from './input.js';
import { uiButton } from './button.js';
import { uiHeroButton, uiTextLink, uiTitleFrame, uiTitleNotice, uiTitleSentence } from './gateway-game.js';

export type UiGatewayAction = 'sign-in'|'register'|'recover'|'enter-world'|'sign-out'|'continue-local'|'toggle-preview';
export interface UiGatewayModel {
  readonly localPreview: boolean; readonly signedIn: boolean; readonly displayName?: string;
  readonly profiles: readonly string[]; readonly selected: number;
  readonly message: string; readonly error?: string|null; readonly busy: boolean;
  readonly version?: string; readonly allowLocalPreview?: boolean; readonly allowPreviewToggle?: boolean;
}
export interface UiGatewayOptions {
  readonly preserveNameOnNavigate?: boolean;
  readonly model: UiGatewayModel; readonly emblem?: LoadedAsset; readonly cask?: LoadedAsset; readonly layout?: UiStyle;
  readonly onAction: (action: UiGatewayAction, name?: string) => void;
  readonly onSelectProfile: (index: number) => void; readonly onNameChange?: (name: string) => void;
}
export interface UiGatewayElement extends UiElement {
  readonly editor: CanvasTextEditor;
  updateGateway(model: UiGatewayModel): void;
  focusName(): void;
  selectAdjacentProfile(direction: -1|1): void;
  submit(): void;
  invokeAction(action: UiGatewayAction): void;
  clearName(): void;
}

export const UI_GATEWAY_TAGLINE = 'Tend the orchard, fill the cellar, share the island.';

/** Account entry and local profiles share the title flow's one constant frame (logo sign over the fixed
 * wood window). Signed out: WELCOME with Sign in and the Create/Recover links; signed in: WELCOME BACK
 * with Enter the world and Sign out; local development profiles: LOCAL PREVIEW. Hosts own auth and navigation. */
export function uiGateway(options: UiGatewayOptions): UiGatewayElement {
  let model = options.model, namesKey = '';
  const editor = new CanvasTextEditor({ maxLength: 20 });
  const invoke = (action: UiGatewayAction) => {
    if (model.busy) return;
    if (action === 'toggle-preview' && !(model.allowPreviewToggle ?? model.allowLocalPreview)) return;
    if (action === 'continue-local' && !model.localPreview) return;
    if (['sign-in', 'register', 'recover'].includes(action) && (model.signedIn || model.localPreview)) return;
    if (['enter-world', 'sign-out'].includes(action) && (!model.signedIn || model.localPreview)) return;
    options.onAction(action, action === 'continue-local' ? editor.snapshot().value : undefined);
  };
  const submit = () => { if (editor.snapshot().composing) return; invoke(model.localPreview ? 'continue-local' : model.signedIn ? 'enter-world' : 'sign-in'); };
  const controls = new Map<UiGatewayAction, UiElement>();
  const hero = (id: UiGatewayAction, label: string, width = 160) => { const button = uiHeroButton({ id: `gateway.${id}`, label, width, onPress: () => invoke(id) }); controls.set(id, button); return button; };
  const link = (id: UiGatewayAction, label: string, light = false) => { const node = uiTextLink({ id: `gateway.${id}`, label, light, onPress: () => invoke(id) }); controls.set(id, node); return node; };
  const links = (...items: UiElement[]) => uiFlex({ direction: 'row', gap: 12, justify: 'center', shrink: 0 }, items);

  const notice = uiTitleNotice({ id: 'gateway.error' });
  const says = uiText('', { id: 'gateway.message', wrap: true, align: 'center', layout: { width: 'grow', maxWidth: uiFixed(216) } });
  const signedOut = uiFlex({ direction: 'column', gap: 8, align: 'center', width: 'grow', shrink: 0 },
    [hero('sign-in', 'Sign in'), links(link('register', 'Create account'), link('recover', 'Recover account'))]);
  const name = uiText('', { role: 'special-heading', align: 'center', layout: { width: 'grow' } });
  const status = uiText('', { role: 'caption', align: 'center', wrap: true, layout: { width: 'grow' } });
  const signedIn = uiFlex({ direction: 'column', gap: 6, align: 'center', width: 'grow', shrink: 0 },
    [uiFlex({ direction: 'column', gap: 2, align: 'center', width: 'grow', shrink: 0 }, [name, status]), hero('enter-world', 'Enter the world'), links(link('sign-out', 'Sign out'))]);

  const profiles = uiScrollArea({ id: 'gateway.profiles', width: 'grow', height: 'grow', gap: 2, padding: { right: 6 } });
  const empty = uiText('No saved farmers yet.', { role: 'caption', wrap: true, layout: { width: 'grow' } });
  const input = uiInput({ id: 'gateway.name', label: 'New local development profile name', editor, placeholder: 'New farmer name', onChange: options.onNameChange, onSubmit: submit, layout: { width: 'grow', shrink: 0 } });
  const local = uiFlex({ direction: 'row', gap: 8, width: 'grow', height: uiFixed(96), shrink: 0 }, [
    uiFlex({ direction: 'column', gap: 2, width: uiFixed(96), height: 'grow' }, [profiles, empty]),
    uiFlex({ direction: 'column', gap: 6, grow: 1, align: 'center' }, [input, hero('continue-local', 'Continue', 120),
      uiText('Arrows pick, N for new.', { role: 'caption', wrap: true, align: 'center', layout: { width: 'grow' } })]),
  ]);
  const toggle = link('toggle-preview', 'Local preview', true);

  const frame = uiTitleFrame({ id: 'game.gateway', bodyId: 'gateway.content', title: 'WELCOME', apple: options.emblem, cask: options.cask,
    version: model.version, corner: toggle, layout: options.layout, body: [notice, says, signedOut, signedIn, local] });
  const clearName = () => { editor.setValue(''); frame.invalidate(); };
  const selectProfile = (index: number, clear = true) => { if (model.busy || !model.localPreview || !model.profiles[index]) return; if (clear) clearName(); options.onSelectProfile(index); };
  const updateGateway = (next: UiGatewayModel) => {
    model = next;
    const isLocal = model.localPreview, isSignedIn = !isLocal && model.signedIn, isSignedOut = !isLocal && !isSignedIn;
    const error = model.error ? uiTitleSentence(model.error) : '', message = uiTitleSentence(model.message);
    frame.setTitle(isLocal ? 'LOCAL PREVIEW' : isSignedIn ? 'WELCOME BACK' : 'WELCOME');
    frame.setVersion(model.version);
    notice.setText(error); notice.setStyle({ visible: error !== '' });
    // Idle sign-in shows the island's tagline; while busy the host's status replaces it.
    says.setProps({ text: isSignedOut && !model.busy ? UI_GATEWAY_TAGLINE : message })
      .setStyle({ visible: isLocal ? message !== '' : isSignedOut && error === '' });
    signedOut.setStyle({ visible: isSignedOut }); signedIn.setStyle({ visible: isSignedIn }); local.setStyle({ visible: isLocal });
    name.setProps({ text: model.displayName ?? '' });
    status.setProps({ text: model.busy ? message : 'Signed in' });
    empty.setStyle({ visible: model.profiles.length === 0 }); profiles.setStyle({ visible: model.profiles.length > 0 });
    for (const [id, control] of controls) {
      control.setDisabled(model.busy);
      if (id === 'toggle-preview') control.setStyle({ visible: (model.allowPreviewToggle ?? model.allowLocalPreview) === true });
    }
    toggle.setProps({ label: isLocal ? 'Account login' : 'Local preview' }); input.setDisabled(model.busy);
    const key = JSON.stringify(model.profiles);
    if (key !== namesKey) { namesKey = key; profiles.replaceChildren(model.profiles.map((profile, index) => uiButton({ id: `gateway.profile.${index}`, label: profile.toUpperCase(), size: 'sm', layout: { width: 'grow', shrink: 0 }, onPress: () => selectProfile(index) }))); }
    for (const [index, button] of profiles.children.entries()) button.setDisabled(model.busy).setProps({ tone: index === model.selected ? 'success' : 'primary' });
  };
  frame.setProps({ singlePointer: true, touchScroll: true });
  updateGateway(model);
  return Object.assign(frame, {
    editor, updateGateway, submit, invokeAction: invoke, clearName,
    focusName() { if (model.localPreview && !model.busy) input.requestFocus(); },
    selectAdjacentProfile(direction: -1 | 1) {
      if (model.busy || !model.localPreview || !model.profiles.length) return;
      const index = (model.selected + direction + model.profiles.length) % model.profiles.length;
      selectProfile(index, !options.preserveNameOnNavigate);
      const row = profiles.children[index];
      if (row) {
        if (options.preserveNameOnNavigate) row.requestFocus();
        const top = row.rect.y - profiles.contentRect.y;
        scrollUiElement(profiles, 0, profiles.scroll.y + (top < 0 ? top : Math.max(0, top + row.rect.height - profiles.contentRect.height)));
      }
    },
  });
}
