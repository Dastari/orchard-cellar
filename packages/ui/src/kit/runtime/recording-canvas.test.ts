import {expect,it} from 'vitest';
import {createUiRecordingCanvas} from './recording-canvas.js';
it('records transformed dashed connector strokes inside the active clip and restores width',()=>{
 const recorder=createUiRecordingCanvas(100,100),ctx=recorder.context;ctx.scale(2,2);ctx.beginPath();ctx.rect(5,5,20,20);ctx.clip();ctx.lineWidth=2;ctx.save();ctx.lineWidth=4;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(40,40);ctx.stroke();ctx.restore();expect(ctx.lineWidth).toBe(2);expect(recorder.records).toEqual([{kind:'stroke',rect:{x:10,y:10,width:40,height:40},clip:{x:10,y:10,width:40,height:40}}]);expect(recorder.balanced).toBe(true);
});
