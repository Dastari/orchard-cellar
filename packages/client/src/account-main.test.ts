import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { beforeAll, expect, it, vi } from 'vitest';
import { GameGateway, gameGatewayLayout } from '../../ui/src/game-host/gateway.js';
import { GameUiRuntime } from '../../ui/src/game-host/runtime.js';
import { uiTestArt } from '../../ui/src/kit/lab/testing/art.js';
import type { UiKitArt } from '../../ui/src/kit/components/art.js';
import { localProfileWorldUrl, readLocalProfiles, rememberLocalProfile, validLocalProfileName } from './account-profile.js';
const source=ts.createSourceFile('account-main.ts',readFileSync(new URL('./account-main.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const functions=['navigateWithMusic','launchLocal','launchAccount','submitLocal','submitAccount','updateGateway'];
const bodies=functions.map(name=>{const node=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);if(!node)throw Error(`missing${name}`);return node.getText(source);}).join('\n');
const gatewayDeclaration=source.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(source)==='gateway'))!;
const code=ts.transpileModule(`let authSession=options.signedIn?{subject:'authorized-test',displayName:'Test farmer'}:null;
let authBusy=false,authError=null,navigationPending=false,localPreview=options.local;
let profiles=readLocalProfiles(localStorage),selected=0,message='Start';
const oidcConfigured=options.oidc,localProfilesEnabled=options.allowLocal,clientVersion='test';
${gatewayDeclaration.getText(source)}
const runtime=new GameUiRuntime();runtime.register({id:'gateway',root:gateway.root,priority:1,active:()=>gateway.active,blocking:()=>true});
${bodies}
const scene=gameGatewayLayout(320,180);gateway.setBounds(scene.frame,scene.width,scene.height);updateGateway();
return {gateway,runtime,state:()=>({authBusy,navigationPending,localPreview,message,selected}),submitLocal,submitAccount};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let art:UiKitArt;
beforeAll(async()=>{art=await uiTestArt();});
function fixture(options={signedIn:false,local:false,oidc:true,allowLocal:false}) {
 const values=new Map<string,string>();const localStorage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)};
 const deps={options,localStorage,GameGateway,GameUiRuntime,gameGatewayLayout,kitArt:art,orchardEmblem:undefined,cellarCask:undefined,resize:vi.fn(),
  readLocalProfiles,rememberLocalProfile,localProfileWorldUrl,validLocalProfileName,
  audio:{fadeOutForNavigation:vi.fn(()=>Promise.resolve())},location:{origin:'https://example.invalid',pathname:'/',search:'',hash:'',assign:vi.fn(),reload:vi.fn()},
  beginOidcLogin:vi.fn<(intent:string)=>Promise<void>>(async()=>{}),signOutOidc:vi.fn(async()=>{})};
 const host=new Function(...Object.keys(deps),code)(...Object.values(deps)) as {gateway:GameGateway;runtime:GameUiRuntime;state():{authBusy:boolean;navigationPending:boolean;localPreview:boolean;message:string;selected:number};submitLocal():void;submitAccount(intent?:string):Promise<void>};
 return {...host,...deps,dispose(){host.runtime.dispose();host.gateway.dispose();}};
}
function press(f:ReturnType<typeof fixture>,id:string){const root=f.gateway.root;root.arrange();const node=root.entries().find(e=>e.element.id===id)!.element;root.focus.set(node);root.key({key:'Enter'});}
it.each([['gateway.sign-in','login'],['gateway.register','register'],['gateway.recover','recover']])('actual account callback routes%s once with immediate busy gating',async(id,intent)=>{
 const f=fixture();try{press(f,id!);press(f,id!);expect(f.beginOidcLogin).toHaveBeenCalledExactlyOnceWith(intent);expect(f.state().authBusy).toBe(true);expect(f.location.assign).not.toHaveBeenCalled();await Promise.resolve();}finally{f.dispose();}
});
it('actual account callback exposes rejection and allows a fresh scoped retry',async()=>{
 const f=fixture();try{f.beginOidcLogin.mockRejectedValueOnce(new Error('Provider unavailable'));await f.submitAccount('recover');expect(f.state().authBusy).toBe(false);
 expect(f.gateway.root.entries().some(e=>e.element.props['text']==='Provider unavailable')).toBe(true);await f.submitAccount('recover');expect(f.beginOidcLogin).toHaveBeenCalledTimes(2);}finally{f.dispose();}
});
it('preserves validation/storage and schedules local navigation only once',async()=>{
 const f=fixture({signedIn:false,local:true,oidc:false,allowLocal:true});try{
 f.gateway.editor.setValue('!');press(f,'gateway.continue-local');expect(f.audio.fadeOutForNavigation).not.toHaveBeenCalled();expect(f.state().message).toContain('USE 3-20');
 f.gateway.editor.setValue('Mara');press(f,'gateway.continue-local');press(f,'gateway.continue-local');expect(f.state().navigationPending).toBe(true);expect(f.audio.fadeOutForNavigation).toHaveBeenCalledOnce();
 await Promise.resolve();expect(f.location.assign).toHaveBeenCalledExactlyOnceWith(localProfileWorldUrl('Mara','https://example.invalid'));expect(readLocalProfiles(f.localStorage).lastUsed).toBe('Mara');
 }finally{f.dispose();}
});
it('keeps development toggle disabled and signed-in entry/signout scoped',async()=>{
 const f=fixture({signedIn:true,local:false,oidc:true,allowLocal:false});try{
 expect(f.gateway.handleGlobalKeyDown({key:'d'})).toBe(false);expect(f.state().localPreview).toBe(false);
 press(f,'gateway.enter-world');press(f,'gateway.sign-out');await Promise.resolve();expect(f.location.reload).toHaveBeenCalledOnce();expect(f.signOutOidc).not.toHaveBeenCalled();
 }finally{f.dispose();}
 const logout=fixture({signedIn:true,local:false,oidc:true,allowLocal:false});try{press(logout,'gateway.sign-out');await Promise.resolve();expect(logout.signOutOidc).toHaveBeenCalledOnce();expect(logout.state().authBusy).toBe(true);}finally{logout.dispose();}
});
