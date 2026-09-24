import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { edgeSpeechAnchor, speechBubbleHeadOffset, speechBubbleIsRecent, timingLabels } from '@orchard/ui';
const source=readFileSync(new URL('./overworld-main.ts',import.meta.url),'utf8');
function execute(body:string,deps:Record<string,unknown>):unknown {
 const code=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function(...Object.keys(deps),code)(...Object.values(deps));
}
function between(start:string,end:string):string {
 const a=source.indexOf(start),b=source.indexOf(end,a);if(a<0||b<a)throw Error('Production projection missing');return source.slice(a,b);
}
describe('actual feedback authority projections',()=>{
 it('keeps public/offscreen shouts, recipient-filtered newest tells and authority-expiring own thoughts distinct',()=>{
  const now=1_000_000;vi.spyOn(Date,'now').mockReturnValue(now);
  const identity=(id:string)=>({toHexString:()=>id});
  const message=(id:number,speaker:string,kind:string,body:string)=>({id,speaker:identity(speaker),kind,body,x:0,y:0});
  const tell=(id:number,sender:string,sent:number,body:string)=>({id,sender:identity(sender),kind:'whisper',body,sentAt:{microsSinceUnixEpoch:BigInt(sent)*1000n}});
  const snapshot={npcs:[],players:new Map(),worldSpeech:[message(1,'near','say','public'),message(2,'far','say','hidden say'),message(3,'far','shout','edge shout')],
   chatMessages:[tell(4,'near',now-100,'old tell'),tell(5,'near',now-50,'latest private'),tell(6,'far',now-50,'offscreen private'),tell(7,'expired',0,'expired private'),{...tell(8,'near',now,'not private'),kind:'say'}],
   identityHex:'near',clock:{authorityTick:12n},thought:{body:'private thought',expiresTick:12n}};
  const deps={snapshot,renderedPlayerAnchors:new Map([['near',{x:80,y:100}],['far',{x:900,y:100}],['expired',{x:50,y:50}]]),
   FIXED_UNITS_PER_PIXEL:256,cameraX:0,cameraY:0,worldZoom:1,uiScale:1,canvasUiWidth:320,canvasUiHeight:180,
   edgeSpeechAnchor,speechBubbleHeadOffset,speechBubbleIsRecent,localMount:()=>null};
  const body='const feedbackSpeech=[];'+between('    const mountedRiderIds = new Set<string>();','    gameFeedback.setBounds(')+'return feedbackSpeech;';
  try{
   const result=execute(body,deps) as {id:string;text:string;kind:string}[];
   expect(result.map(x=>x.text)).toEqual(['public','edge shout','latest private','private thought']);
   expect(result.map(x=>x.kind)).toEqual(['say','shout','tell','thought']);
   snapshot.clock.authorityTick=13n;expect((execute(body,deps) as {text:string}[]).map(x=>x.text)).not.toContain('private thought');
  }finally{vi.restoreAllMocks();}
 });
 it('projects combat cents, target-following, elevation and authoritative animation age without changing damage',()=>{
  const body='const feedbackEntries=[];'+between('    for (const [combatIndex, combatText] of floatingCombatTexts.entries()) {','  if (!interfaceHidden) {\n    const mountedRiderIds').replace(/\n {2}}\n$/,'')+'return feedbackEntries;';
  const result=execute(body,{floatingCombatTexts:[{targetKind:'npc',targetId:2n,amountCenti:1250,critical:true,x:0,y:0,startedAtMs:450}],feedbackNow:1000,
   snapshot:{npcs:new Map([[2n,{x:100*256,y:80*256}]]),combatTargets:new Map()},FIXED_UNITS_PER_PIXEL:256,
   projectionAt:()=>8,cameraX:20,cameraY:10,worldZoom:2,uiScale:2}) as Record<string,unknown>[];
  expect(result).toHaveLength(1);expect(result[0]).toMatchObject({amount:12.5,critical:true,progress:.5,presentation:'combat',x:80,y:20.5});
 });
 it('rechecks current notice identity, connection/space scope, points and masks before exactly one command',()=>{
  const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
  const names=['currentSkillNoticeId','feedbackSessionKey','feedbackNoticeAvailable','activateFeedbackNotice'];
  const functions=ast.statements.filter((n):n is ts.FunctionDeclaration=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text??'')).map(n=>n.getText(ast)).join('\n');
  const opened=vi.fn();
  const api=execute(`let skillPointNotice={track:'farming',points:1},feedbackNoticeValue=null,feedbackNoticeRevision=0;
   let available=true;const latestSnapshot={identityHex:'me',connected:true,rogueRun:null},network={sessionGeneration:1},activeSpaceDefinition={spaceId:'home'};
   const chatOverlay={isOpen:false},onlinePlayersVisible=false,characterNamePrompt={isActive:false},npcInteractionUi={active:false},tradeUi={active:false};
   const overworldUi={openWindow:null,openSkillTrack:opened};const retainedUiAvailable=()=>available;
   const dismissSkillPointNotice=()=>{skillPointNotice=null;};
   ${functions}
   return {scope:()=>({sessionKey:feedbackSessionKey(),noticeId:currentSkillNoticeId(),track:'farming',points:1}),
    activate:activateFeedbackNotice,replace:()=>{skillPointNotice={track:'farming',points:1}},reconnect:()=>network.sessionGeneration++,mask:()=>{available=false}};`,{opened}) as {scope:()=>unknown;activate:(s:unknown,open:boolean)=>void;replace:()=>void;reconnect:()=>void;mask:()=>void};
  const stale=api.scope();api.replace();api.activate(stale,true);expect(opened).not.toHaveBeenCalled();
  const oldConnection=api.scope();api.reconnect();api.activate(oldConnection,true);expect(opened).not.toHaveBeenCalled();
  const valid=api.scope();api.activate({...valid as object,points:2},true);expect(opened).not.toHaveBeenCalled();
  api.activate(valid,true);api.activate(valid,true);expect(opened).toHaveBeenCalledExactlyOnceWith('farming');
  api.replace();const masked=api.scope();api.mask();api.activate(masked,true);expect(opened).toHaveBeenCalledTimes(1);
 });
});


it.each(['running','paused'] as const)('passes authoritative processor %s timing to the shared hint without inventing a deadline',status=>{
 const timing={status,reason:status==='paused'?'no-fuel':null,confidence:'exact',remainingActiveTicks:120n,progress:.42,stage:null};
 const processor={tileX:3,tileY:4};const processorTiming=vi.fn(()=>({object:{displayName:'FURNACE'},timing}));
 const body='let feedbackHint=null;'+between('  const hoveredDetectedOre =','  if (!interfaceHidden) {\n    for (const [combatIndex')+'return feedbackHint;';
 const result=execute(body,{interfaceHidden:false,worldPointer:{x:60,y:60},overworldUi:{openWindow:null},chatOverlay:{isOpen:false},
 snapshot:{content:{registry:{}},placeables:{revision:2},liveMapDocument:{revision:4}},network:{resourceRevision:2},
 resourcePerceptionForSnapshot:()=>({buriedOre:[]}),identifiedOreAtWorldPoint:()=>null,latestCameraX:0,latestCameraY:0,latestRenderedZoom:1,
 hoveredInteractionTile:null,debugEntitiesHidden:false,timingHoverIndex:{pick:()=>processor},activeSpaceDefinition:{spaceId:'home'},cameraX:0,cameraY:0,
 worldZoom:1,uiScale:1,projectionAt:()=>16,processorTiming,authorityTick:900n,timingLabels}) as {lines:string[];progress:number;x:number;y:number};
 expect(processorTiming).toHaveBeenCalledExactlyOnceWith(expect.anything(),processor,900n);
 expect(result.progress).toBe(.42);expect(result.lines).toEqual(status==='running'?['IN PROGRESS','0:06 LEFT']:['NEEDS FUEL']);
 expect([result.x,result.y]).toEqual([56,56]);
});

it.each([false,true])('preserves crop projection and reveals soil-water detail only with soilWhisperer=%s',soilWhisperer=>{
 const row={id:1n,spaceId:'home',tileX:3,tileY:4,cropKind:'turnip',growthTicks:20n,growthUpdatedAtTick:700n};
 const soil={watered:true,wateredAtTick:700n},definition={displayName:'TURNIP'};
 const timing={status:'paused',reason:'dry',confidence:'exact',remainingActiveTicks:120n,progress:.42,stage:2};
 const projectTiming=vi.fn(()=>timing),cropGrowthAt=vi.fn(()=>({watered:true,wateredUntilTick:960n}));
 const body='let feedbackHint=null;'+between('  const hoveredDetectedOre =','  if (!interfaceHidden) {\n    for (const [combatIndex')+'return feedbackHint;';
 const result=execute(body,{interfaceHidden:false,worldPointer:{x:60,y:60},overworldUi:{openWindow:null},chatOverlay:{isOpen:false},
 snapshot:{content:{registry:{}},placeables:{revision:2},resources:{revision:3},crops:{size:1},soil:new Map([[1n,soil]]),liveMapDocument:{revision:4}},network:{resourceRevision:2},
 resourcePerceptionForSnapshot:()=>({buriedOre:[]}),identifiedOreAtWorldPoint:()=>null,latestCameraX:0,latestCameraY:0,latestRenderedZoom:1,
 hoveredInteractionTile:null,debugEntitiesHidden:false,timingHoverIndex:{pick:()=>null},growthTimingHoverIndex:{pick:()=>({kind:'crop',row})},
 activeSpaceDefinition:{spaceId:'home'},cameraX:0,cameraY:0,worldZoom:1,uiScale:1,projectionAt:()=>16,authorityTick:900n,timingLabels,
 cropDefinitionForSnapshot:()=>definition,cropAutomaticallyWateredForSnapshot:()=>false,cropCalendarOffsetForSnapshot:()=>50n,
 cropGreenhouseProtectedForSnapshot:()=>true,projectTiming,cropGrowthAt,personalFarmingSkills:{soilWhisperer}}) as {lines:string[];progress:number};
 expect(projectTiming).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({kind:'crop',storedGrowthTicks:20n,growthUpdatedAtTick:700n,wateredAtTick:700n,calendarOffsetTicks:50n,greenhouseProtected:true}),900n);
 expect(result.progress).toBe(.42);expect(result.lines).toEqual(['PAUSED: NEEDS WATER',soilWhisperer?'42% 0:03 WATER':'STAGE 3']);
 expect(cropGrowthAt).toHaveBeenCalledTimes(soilWhisperer?1:0);
});


it('gives compact skill notices space without dropping rejection messages or ordinary wide prompts',()=>{
 const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
 const fn=ast.statements.find((n):n is ts.FunctionDeclaration=>ts.isFunctionDeclaration(n)&&n.name?.text==='feedbackHudProjection')!;
 const prompt={text:'[E] USE'},toast={text:'FULL INVENTORY'};
 const run=(height:number,notice:object|null,available:boolean)=>execute(fn.getText(ast)+'return feedbackHudProjection(10,height);',{
  height,skillPointNotice:notice,feedbackNoticeAvailable:()=>available,overworldUi:{feedbackHud:()=>({prompt,toast,tooltip:null})},
 }) as {prompt:unknown;toast:unknown};
 expect(run(60,{},true)).toEqual({prompt:null,toast,tooltip:null});
 expect(run(180,{},true).prompt).toBe(prompt);expect(run(60,null,true).prompt).toBe(prompt);expect(run(60,{},false).prompt).toBe(prompt);
});

it.each([90n,150n,250n])('keeps fishing cast authority at tick%s through camera and UI scaling',tick=>{
 const body='let feedbackFishing=null;'+between('  if (!interfaceHidden && snapshot.fishingCast !== null','  if (!interfaceHidden) for (const marker')+'return feedbackFishing;';
 const result=execute(body,{interfaceHidden:false,snapshot:{fishingCast:{startedTick:100n},identityHex:'me'},renderedPlayerAnchors:new Map([['me',{x:100,y:100}]]),
 renderAuthorityTick:tick,FISHING_CAST_TICKS:100n,cameraX:20,cameraY:10,worldZoom:2,uiScale:2});
 expect(result).toEqual({id:'me',progress:tick===90n?0:tick===150n?.5:1,x:80,y:56});
});
