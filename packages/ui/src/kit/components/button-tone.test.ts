import {createCanvas} from '@napi-rs/canvas';
import {expect,it} from 'vitest';
import {UiRoot} from '../runtime/root.js';
import {uiTestArt} from '../lab/testing/art.js';
import {uiButton} from './button.js';
it('updates both button art and contrast when the retained tone changes',async()=>{
 const art=await uiTestArt();
 const render=(updated:boolean)=>{const root=new UiRoot({art,scale:1});root.resize(160,40);const button=uiButton({label:'STATUS',tone:updated?'primary':'success'});root.mount(button);if(updated)button.setProps({tone:'success'});const canvas=createCanvas(160,40);root.draw(canvas.getContext('2d') as unknown as CanvasRenderingContext2D,0);const pixels=canvas.toBuffer('image/png');root.dispose();return pixels;};
 expect(render(true)).toEqual(render(false));
});
