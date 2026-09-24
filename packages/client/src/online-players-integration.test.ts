import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { nextHomesteadMemberRole } from '../../ui/src/overworld-ui.js';
import type { OnlinePlayerManagementRequest } from '../../ui/src/game-host/online-players.js';
const source=ts.createSourceFile('overworld-main.ts',readFileSync(new URL('./overworld-main.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const functions=['onlinePlayersScope','canManageOnlinePlayers','setOnlinePlayersVisible','releaseOnlinePlayersTab','manageOnlinePlayer'];
const body=functions.map(name=>{const n=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);if(!n)throw Error(name);return n.getText(source);}).join('\n');
const code=ts.transpileModule(`let onlinePlayersVisible=true,rosterOpenedByHeldTab=false;${body};return {manageOnlinePlayer,setOnlinePlayersVisible,releaseOnlinePlayersTab,state:()=>({onlinePlayersVisible,rosterOpenedByHeldTab})}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(role:string|null='guest'){
 const identity={toHexString:()=> 'peer'};
 const latestSnapshot={connected:true,identityHex:'owner',homesteads:new Map([[1,{owner:{toHexString:()=> 'owner'}}]]),profiles:new Map([['peer',{identity,online:true}]]),homesteadMembers:role===null?[]:[{guest:identity,role}]};
 const deps={latestSnapshot,activeSpaceDefinition:{spaceId:1},network:{sessionGeneration:1,removeHomesteadMember:vi.fn(()=>Promise.resolve()),setHomesteadMemberRole:vi.fn(()=>Promise.resolve())},retainedUiAvailable:vi.fn(()=>true),
  characterNamePrompt:{isActive:false},npcInteractionUi:{active:false},tradeUi:{active:false},
  nextHomesteadMemberRole,isHomesteadMemberRole:(value:string)=>['guest','worker','builder'].includes(value),showResult:vi.fn(),updateOnlinePlayers:vi.fn(),retainedUi:{reconcile:vi.fn()},syncRetainedText:vi.fn()};
 const api=new Function(...Object.keys(deps),code)(...Object.values(deps)) as {manageOnlinePlayer(r:OnlinePlayerManagementRequest):void;setOnlinePlayersVisible(v:boolean,h?:boolean):void;releaseOnlinePlayersTab():boolean;state():{onlinePlayersVisible:boolean;rosterOpenedByHeldTab:boolean}};
 const request:OnlinePlayerManagementRequest={scopeKey:'owner:1:1',expectedIdentityHex:'peer',expectedRole:role as OnlinePlayerManagementRequest['expectedRole'],intent:'cycle'};
 return {...deps,...api,request,identity};
}
it.each([[null,'guest'],['guest','worker'],['worker','builder'],['builder',null]] as const)('actual authority boundary cycles%s to%s once without optimistic mutation', (role,next)=>{
 const f=fixture(role);f.manageOnlinePlayer(f.request);
 if(next===null)expect(f.network.removeHomesteadMember).toHaveBeenCalledExactlyOnceWith(f.identity,false);
 else expect(f.network.setHomesteadMemberRole).toHaveBeenCalledExactlyOnceWith(f.identity,next);
 expect(f.latestSnapshot.homesteadMembers[0]?.role??null).toBe(role);
});
it('keeps explicit removal and kick distinct from the role cycle',()=>{
 const f=fixture();f.manageOnlinePlayer({...f.request,intent:'remove'});expect(f.network.removeHomesteadMember).toHaveBeenCalledExactlyOnceWith(f.identity,true);expect(f.network.setHomesteadMemberRole).not.toHaveBeenCalled();
});
it.each(['role','offline','missing','owner','self','connection','generation','space','hidden','blocked','name','npc','trade'] as const)('actual callback rejects a stale or unauthorized%s request',change=>{
 const f=fixture();
 if(change==='role')f.latestSnapshot.homesteadMembers[0]!.role='builder';
 if(change==='offline')f.latestSnapshot.profiles.get('peer')!.online=false;
 if(change==='missing')f.latestSnapshot.profiles.clear();
 if(change==='owner')f.latestSnapshot.homesteads.clear();
 if(change==='self')f.request={...f.request,expectedIdentityHex:'owner'};
 if(change==='connection')f.latestSnapshot.connected=false;
 if(change==='generation')f.network.sessionGeneration=2;
 if(change==='space')f.activeSpaceDefinition.spaceId=2;
 if(change==='hidden')f.setOnlinePlayersVisible(false);
 if(change==='blocked')f.retainedUiAvailable.mockReturnValue(false);
 if(change==='name')f.characterNamePrompt.isActive=true;
 if(change==='npc')f.npcInteractionUi.active=true;
 if(change==='trade')f.tradeUi.active=true;
 f.manageOnlinePlayer(f.request);expect(f.network.removeHomesteadMember).not.toHaveBeenCalled();expect(f.network.setHomesteadMemberRole).not.toHaveBeenCalled();
});
it('actual hold-Tab lifecycle closes only a hold-open roster, preserving sticky HUD opens',()=>{
 const f=fixture();f.setOnlinePlayersVisible(true,true);expect(f.releaseOnlinePlayersTab()).toBe(true);expect(f.state().onlinePlayersVisible).toBe(false);
 f.setOnlinePlayersVisible(true);expect(f.releaseOnlinePlayersTab()).toBe(false);expect(f.state().onlinePlayersVisible).toBe(true);
 f.setOnlinePlayersVisible(false);expect(f.state().rosterOpenedByHeldTab).toBe(false);
});
