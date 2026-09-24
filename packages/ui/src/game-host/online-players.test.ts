import { mkdirSync, writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { GameOnlinePlayers, type GameOnlinePlayersModel, type OnlinePlayerRole } from './online-players.js';
import type { UiKitArt } from '../kit/components/art.js';
import { uiTestArt } from '../kit/lab/testing/art.js';
import type { UiRoot } from '../kit/runtime/root.js';
let art: UiKitArt;
const hosts: GameOnlinePlayers[] = [];
beforeAll(async () => { art = await uiTestArt(); });
afterEach(() => { hosts.splice(0).forEach(host => host.dispose()); vi.unstubAllGlobals(); });
const model: GameOnlinePlayersModel = { scopeKey: 'owner:connection:homestead', identityHex: 'owner', visible: true, canManage: true,
  players: [{ identityHex: 'owner', displayName: 'Mara', self: true, idleMinutes: null, homesteadRole: null },
    { identityHex: 'peer', displayName: 'Toby', self: false, idleMinutes: 12, homesteadRole: 'guest' }] };
function fixture(overrides: Partial<GameOnlinePlayersModel> = {}) {
  const onManage = vi.fn(), onClose = vi.fn(); const host = new GameOnlinePlayers(art, { onManage, onClose }); hosts.push(host);
  host.setBounds({ x: 10, y: 10, width: 300, height: 250 }, 640, 400); host.update({ ...model, ...overrides });
  return { host, onManage, onClose };
}
function node(root: UiRoot, id: string) { root.arrange(); const found = root.entries().find(entry => entry.element.id === id)?.element; if (!found) throw new Error(`Missing ${id}`); return found; }
function focus(root: UiRoot, id: string) { const found = node(root, id); root.focus.set(found); root.arrange(); return found; }
function point(root: UiRoot, id: string) { const found = focus(root, id); return { x: found.rect.x + 5, y: found.rect.y + 5 }; }
const row = (id: string) => `game.online-players:player:${id}`;
const remove = (id: string) => `game.online-players:remove:${id}`;
function tap(root: UiRoot, id: string, button = 0) { const p = point(root, id); root.pointer({ type: 'down', point: p, button, pointerId: 1 }); root.pointer({ type: 'up', point: p, button, pointerId: 1 }); }
const many = Array.from({ length: 40 }, (_, i) => ({ identityHex: `peer-${i}`, displayName: `A Twenty Letter Name ${i}`, self: false, idleMinutes: i % 2 ? 12 : null, homesteadRole: 'guest' as const }));

it.each([null, 'guest', 'worker', 'builder'] as const)('sends a scoped cycle intent with expected current role %s and leaves role authority unchanged', role => {
  const snapshot = { ...model, players: [model.players[0]!, { ...model.players[1]!, homesteadRole: role as OnlinePlayerRole }] };
  const { host, onManage } = fixture(snapshot); const p = point(host.root, row('peer'));
  host.root.pointer({ type: 'down', point: p, button: 0, pointerId: 1 }); expect(onManage).not.toHaveBeenCalled();
  host.root.pointer({ type: 'up', point: p, button: 0, pointerId: 1 });
  expect(onManage).toHaveBeenCalledExactlyOnceWith({ scopeKey: model.scopeKey, expectedIdentityHex: 'peer', expectedRole: role, intent: 'cycle' });
  host.update(snapshot); expect(node(host.root, row('peer')).label).toContain(role ? `[${role.toUpperCase()}]` : 'Toby');
  // A rejected command is simply an unchanged authoritative projection; no optimistic role is invented.
  expect(snapshot.players[1]!.homesteadRole).toBe(role);
});

it('keeps explicit remove/right-click distinct, guards self by both flag and identity, and suppresses repeat activation', () => {
  const { host, onManage } = fixture();
  expect(node(host.root, remove('peer')).label).toContain('Remove and kick');
  tap(host.root, row('peer'), 2); tap(host.root, remove('peer'));
  expect(onManage.mock.calls.map(call => call[0].intent)).toEqual(['remove', 'remove']);
  focus(host.root, row('peer')); host.root.key({ key: 'Enter', repeat: true }); expect(onManage).toHaveBeenCalledTimes(2);
  host.root.key({ key: 'Enter' }); expect(onManage).toHaveBeenLastCalledWith({ scopeKey: model.scopeKey, expectedIdentityHex: 'peer', expectedRole: 'guest', intent: 'cycle' });
  tap(host.root, row('owner')); expect(onManage).toHaveBeenCalledTimes(3);
  host.update({ ...model, players: model.players.map(player => ({ ...player, self: false })) }); tap(host.root, row('owner')); expect(onManage).toHaveBeenCalledTimes(3);
  host.update({ ...model, canManage: false }); tap(host.root, row('peer')); expect(onManage).toHaveBeenCalledTimes(3);
  expect(host.root.entries().some(entry => entry.element.id === remove('peer'))).toBe(false);
  host.update({ ...model, identityHex: null }); tap(host.root, row('peer')); expect(onManage).toHaveBeenCalledTimes(3);
});

it.each(['reorder','role','permission','self','identity','space','hidden','disconnect'] as const)('cancels a held row gesture on %s changes, then permits a fresh authorized gesture', change => {
  const { host, onManage } = fixture(); const p = point(host.root, row('peer'));
  host.root.pointer({ type: 'down', point: p, button: 0, pointerId: 7 });
  const next = change === 'disconnect' ? null : { ...model,
    ...(change === 'reorder' ? { players: model.players.toReversed() } : change === 'role' ? { players: model.players.map(player => ({ ...player, homesteadRole: 'builder' as const })) }
      : change === 'permission' ? { canManage: false } : change === 'self' ? { players: model.players.map(player => ({ ...player, self: true })) }
        : change === 'identity' ? { identityHex: 'peer' } : change === 'space' ? { scopeKey: 'owner:connection:new-space' } : { visible: false }) };
  host.update(next); host.update(model);
  host.root.pointer({ type: 'up', point: p, button: 0, pointerId: 7 }); expect(onManage).not.toHaveBeenCalled();
  tap(host.root, row('peer')); expect(onManage).toHaveBeenCalledExactlyOnceWith({ scopeKey: model.scopeKey, expectedIdentityHex: 'peer', expectedRole: 'guest', intent: 'cycle' });
});

it('keeps stable row/focus/scroll on idle or label echoes and reveals that same row on compact resize', () => {
  const { host } = fixture({ players: many }); const root = host.root, target = focus(root, row('peer-30'));
  const list = node(root, 'game.online-players:list'), offset = list.scroll.y; expect(offset).toBeGreaterThan(0);
  host.update({ ...model, players: many.map(player => ({ ...player, displayName: `${player.displayName} renamed`, idleMinutes: 30 })) });
  expect(host.root).toBe(root); expect(root.focus.current).toBe(target); expect(list.scroll.y).toBe(offset);
  expect(target.label).toContain('(idle 30 min)'); expect(node(root, row('peer-30'))).toBe(target);
  host.setBounds({ x: 4, y: 4, width: 312, height: 172 }, 320, 180); expect(root.focus.current).toBe(target); expect(target.clip.height).toBe(target.rect.height);
});

it('scrolls a manageable row with touch without any command at down, 3px, 4px, 24px or up; secondary touch cannot steal focus', () => {
  const { host, onManage } = fixture({ players: many }); const p = point(host.root, row('peer-2')), focused = host.root.focus.current;
  const pointer = (type: 'down'|'move'|'up'|'cancel', dy = 0, pointerId = 1, isPrimary = true) => host.root.pointer({ type, point: { x: p.x, y: p.y - dy }, button: 0, pointerId, pointerType: 'touch', isPrimary });
  pointer('down'); expect(onManage).not.toHaveBeenCalled();
  pointer('down', 5, 2, false); expect(host.root.focus.current).toBe(focused);
  for (const dy of [3,4,24]) { pointer('move', dy); expect(onManage).not.toHaveBeenCalled(); }
  pointer('up',24); pointer('up',5,2,false); expect(onManage).not.toHaveBeenCalled();
  expect(node(host.root,'game.online-players:list').scroll.y).toBeGreaterThan(0);
  const next=point(host.root,row('peer-3'));host.root.pointer({type:'down',point:next,button:0,pointerId:4,pointerType:'touch',isPrimary:true});host.root.pointer({type:'cancel',point:next,button:0,pointerId:4,pointerType:'touch'});host.root.pointer({type:'up',point:next,button:0,pointerId:4,pointerType:'touch'});expect(onManage).not.toHaveBeenCalled();
  tap(host.root,row('peer-3'));expect(onManage).toHaveBeenCalledExactlyOnceWith({scopeKey:model.scopeKey,expectedIdentityHex:'peer-3',expectedRole:'guest',intent:'cycle'});
});

it('supports modal keyboard navigation, page scrolling, and one close callback per visibility interval', () => {
  const { host, onClose } = fixture({ players: many });
  host.root.key({ key:'End' }); expect(host.root.focus.current?.id).toBe(remove('peer-39'));
  host.root.key({ key:'Home' }); expect(host.root.focus.current?.id).toBe(row('peer-0'));
  host.root.key({ key:'ArrowDown' }); expect(host.root.focus.current?.id).toBe(remove('peer-0'));
  const list=node(host.root,'game.online-players:list');host.root.key({key:'PageDown'});expect(list.scroll.y).toBeGreaterThan(0);host.root.key({key:'PageUp'});expect(list.scroll.y).toBe(0);
  host.root.key({key:'Escape'});expect(host.active).toBe(false);expect(onClose).toHaveBeenCalledOnce();
  host.update({...model,players:many});host.root.key({key:'Escape'});expect(onClose).toHaveBeenCalledOnce();
  host.update({...model,visible:false});host.update(model);host.root.key({key:'Escape'});expect(onClose).toHaveBeenCalledTimes(2);
});

it('preserves YOU/idle/role labels and actual status dots, with all long-row actions reachable at compact/wide sizes', () => {
  vi.stubGlobal('document',{createElement:()=>createCanvas(1,1)});
  const {host}=fixture({players:[...model.players,...many]});
  expect(node(host.root,row('owner')).label).toContain('(YOU)');expect(node(host.root,row('peer')).label).toContain('(idle 12 min)  [GUEST]');
  const evidence=process.env['ORCHARD_ROSTER_EVIDENCE'];if(evidence)mkdirSync(evidence,{recursive:true});
  for(const [width,height] of [[320,180],[800,500]] as const) {
    host.setBounds({x:4,y:4,width:Math.min(320,width-8),height:height-8},width,height);
    for(const id of [row('owner'),row('peer-39'),remove('peer-39')]){const target=focus(host.root,id);expect(target.rect.height).toBe(target.clip.height);expect(target.rect.width).toBe(target.clip.width);}
    focus(host.root,row('owner'));
    for(const scale of [1,2,3]) {
      const canvas=createCanvas(Math.round(width*scale*1.25),Math.round(height*scale*1.25)),ctx=canvas.getContext('2d'),colors:string[]=[];
      const fill=ctx.fillRect.bind(ctx);ctx.fillRect=((...args:Parameters<typeof fill>)=>{if(args[2]===4&&args[3]===4)colors.push(String(ctx.fillStyle));fill(...args);}) as typeof ctx.fillRect;
      ctx.scale(scale*1.25,scale*1.25);host.draw(ctx as unknown as CanvasRenderingContext2D);
      expect(colors).toContain('#4f8f42');expect(colors).toContain('#d7a928');
      if(evidence)writeFileSync(`${evidence}/roster-${width}-scale${scale}-dpr1.25.png`,canvas.toBuffer('image/png'));
    }
  }
});

it('reopens visible frame chrome and commands after the real close button hides its frame', () => {
 const {host,onClose,onManage}=fixture();
 const close=()=>{host.root.arrange();const button=host.root.entries().find(e=>e.element.label==='X')!.element;
 const p={x:button.rect.x+button.rect.width/2,y:button.rect.y+button.rect.height/2};
 host.root.pointer({type:'down',point:p,pointerId:20,button:0});host.root.pointer({type:'up',point:p,pointerId:20,button:0});};
 close();expect(host.active).toBe(false);expect(onClose).toHaveBeenCalledOnce();
 host.update(model);expect(host.active).toBe(false);
 host.update({...model,visible:false});host.update(model);expect(host.active).toBe(true);
 tap(host.root,row('peer'));expect(onManage).toHaveBeenCalledOnce();close();expect(onClose).toHaveBeenCalledTimes(2);
});
