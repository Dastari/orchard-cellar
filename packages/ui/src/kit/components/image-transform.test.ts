import { createCanvas } from '@napi-rs/canvas';
import { expect, it } from 'vitest';
import { uiImage } from './media.js';
import { UiRoot } from '../runtime/root.js';

it('rotates non-square pixel art in its snapped hit rectangle without leaking the transform',()=>{
  const source=createCanvas(2,1),paint=source.getContext('2d');
  paint.fillStyle='#ff0000';paint.fillRect(0,0,1,1);paint.fillStyle='#00ff00';paint.fillRect(1,0,1,1);
  const root=new UiRoot({scale:1});root.resize(1,2);
  const node=uiImage(source as unknown as CanvasImageSource,{width:2,height:1},{label:'Turned sprite',quarterTurns:1});root.mount(node);root.arrange();
  const canvas=createCanvas(1,2),context=canvas.getContext('2d');root.draw(context as unknown as CanvasRenderingContext2D);
  expect(node.rect).toEqual({x:0,y:0,width:1,height:2});expect(node.clip).toEqual(node.rect);
  expect([...context.getImageData(0,0,1,2).data]).toEqual([255,0,0,255,0,255,0,255]);
  expect(context.getTransform().isIdentity).toBe(true);root.dispose();
});
