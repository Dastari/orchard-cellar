import { createCanvas } from '@napi-rs/canvas';
import { expect, it } from 'vitest';
import type { LoadedAsset } from '@orchard/ui';
import { spriteAnimationVariant } from './sprite-variant.js';
it('extracts, mirrors and recolours exact sprite pixels while retaining alpha and timing', () => {
  const image=createCanvas(4,1), context=image.getContext('2d');
  context.fillStyle='#424c6e';context.fillRect(1,0,1,1);context.fillStyle='#ffffff';context.fillRect(2,0,1,1);
  const asset={name:'test',image,metadata:{image:'test',animations:{idle:[{x:1,y:0,width:2,height:1,durationTicks:7}]}}} as unknown as LoadedAsset;
  const result=spriteAnimationVariant(asset,'idle',{flipX:true,palette:new Map([['#424c6e','#743f39']]),createCanvas:(w,h)=>createCanvas(w,h) as unknown as OffscreenCanvas});
  const pixels=(result.image as OffscreenCanvas).getContext('2d')!.getImageData(0,0,2,1).data;
  expect([...pixels]).toEqual([255,255,255,255,116,63,57,255]);
  expect(result.metadata.animations['idle']).toEqual([{x:0,y:0,width:2,height:1,durationTicks:7}]);
  expect(image.width).toBe(4);
});
