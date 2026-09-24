import { createCanvas } from '@napi-rs/canvas';
import { uiTestArt, uiTestAsset } from '../../ui/src/kit/lab/testing/art.js';
import { afterEach, expect, it, vi } from 'vitest';
import { upgradeLoadingScreen, dismissLoadingScreen, setLoadingScreenStage } from '@orchard/engine/loading-screen';

afterEach(()=>vi.unstubAllGlobals());
it('upgrades the permanent startup canvas once and releases its only loop and resize listener',async()=>{
 const art=await uiTestArt(),emblem=uiTestAsset('icon_resource_fruit');
 const bitmap=createCanvas(1,1),context=bitmap.getContext('2d');
 const canvas={width:0,height:0,clientWidth:320,clientHeight:180,parentElement:{clientWidth:320,clientHeight:180},style:{},getContext:()=>context};
 const status={textContent:'',hidden:false,setAttribute:vi.fn()},frames=new Map<number,FrameRequestCallback>();let serial=0;
 const target=new EventTarget(),remove=vi.spyOn(target,'removeEventListener');
 vi.stubGlobal('window',target);vi.stubGlobal('innerWidth',320);vi.stubGlobal('innerHeight',180);vi.stubGlobal('devicePixelRatio',1.25);
 vi.stubGlobal('getComputedStyle',()=>({getPropertyValue:()=> '0'}));
 vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++serial,callback);return serial;});
 vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));
 vi.stubGlobal('document',{querySelector:(selector:string)=>selector==='#game'?canvas:status,createElement:()=>createCanvas(1,1)});
 upgradeLoadingScreen(art,emblem);upgradeLoadingScreen(art,emblem);expect(frames.size).toBe(1);
 expect([canvas.width,canvas.height]).toEqual([400,225]);
 setLoadingScreenStage({title:'SAILING',detail:'READING THE WORLD',progress:65});
 const [id,draw]=[...frames][0]!;frames.delete(id);draw(10);expect(frames.size).toBe(1);
 dismissLoadingScreen();expect(frames.size).toBe(0);expect(status.hidden).toBe(true);expect(remove).toHaveBeenCalledWith('resize',expect.any(Function));
});
