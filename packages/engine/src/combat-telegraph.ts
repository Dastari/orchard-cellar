import {FIXED_UNITS_PER_PIXEL,enemyAttackPhaseAt,enemyAttackSegmentAt,type EnemyAttackCommitment} from '@orchard/sim';

/** Read-only presentation of an authoritative commitment. Logical coordinates
 * are projected by the caller; drawing never decides collision or hit results. */
export function drawEnemyAttackTelegraph(context:CanvasRenderingContext2D,attack:EnemyAttackCommitment,tick:bigint,
  cameraX:number,cameraY:number,scale:number,projectY:(x:number,y:number)=>number):void {
  const phase=enemyAttackPhaseAt(attack,tick);
  if(phase==='complete'||phase==='recovery')return;
  const point=(x:number,y:number)=>{const px=x/FIXED_UNITS_PER_PIXEL,py=y/FIXED_UNITS_PER_PIXEL;
    return {x:(px-cameraX)*scale,y:(projectY(px,py)-cameraY)*scale};};
  const from=point(attack.originX,attack.originY),to=point(attack.targetX,attack.targetY);
  const pulse=attack.pattern==='pulse'||attack.pattern==='burst';
  const activeSegment=enemyAttackSegmentAt(attack,tick);
  const dangerous=phase==='active'&&(!pulse||activeSegment!==null);
  context.save();
  context.lineCap='round';
  context.strokeStyle=!dangerous?'#ffe098':'#fff2d0';
  context.fillStyle=!dangerous?'rgba(239,148,57,0.24)':'rgba(249,67,42,0.42)';
  context.lineWidth=Math.max(1,scale);
  if(pulse){
    context.beginPath();context.arc(to.x,to.y,14.4*scale,0,Math.PI*2);context.fill();context.stroke();
    const progress=Math.max(0,Math.min(1,Number(tick-attack.startedTick)/(attack.tellTicks+attack.activeTicks-1)));
    context.beginPath();context.arc(to.x,to.y,14.4*scale*progress,0,Math.PI*2);context.stroke();
  }else{
    context.beginPath();context.moveTo(from.x,from.y);context.lineTo(to.x,to.y);
    context.strokeStyle=phase==='tell'?'rgba(239,148,57,0.24)':'rgba(249,67,42,0.3)';
    context.lineWidth=19.2*scale;context.stroke();
    context.strokeStyle=!dangerous?'#ffe098':'#fff2d0';context.lineWidth=Math.max(1,scale);
    if(attack.pattern==='charge'||attack.pattern==='dive') {
      context.stroke();
      const angle=Math.atan2(to.y-from.y,to.x-from.x),length=Math.hypot(to.x-from.x,to.y-from.y);
      for(let distance=12*scale;distance<length;distance+=16*scale){
        const x=from.x+Math.cos(angle)*distance,y=from.y+Math.sin(angle)*distance;
        context.beginPath();context.moveTo(x-Math.cos(angle-.7)*5*scale,y-Math.sin(angle-.7)*5*scale);
        context.lineTo(x,y);context.lineTo(x-Math.cos(angle+.7)*5*scale,y-Math.sin(angle+.7)*5*scale);context.stroke();
      }
    }else{context.setLineDash([2*scale,5*scale]);context.stroke();context.setLineDash([]);}
    context.beginPath();context.arc(to.x,to.y,4*scale,0,Math.PI*2);context.stroke();
    const segment=enemyAttackSegmentAt(attack,tick);
    if(segment!==null){const bolt=point(segment.to.x,segment.to.y);
      context.fillStyle='#fff2d0';context.beginPath();context.arc(bolt.x,bolt.y,3*scale,0,Math.PI*2);context.fill();}
  }
  context.restore();
}

/** Small, non-flashing cues use existing avatar art: a frontal guard arc or a
 * broken foot ring during the committed dodge. No implied new armor animation. */
export function drawPlayerDefenseCue(context:CanvasRenderingContext2D,kind:'block'|'dodge',facing:string,
  x:number,y:number,cameraX:number,cameraY:number,scale:number):void {
  const dx=/left/i.test(facing)?-1:/right/i.test(facing)?1:0;
  const dy=/up/i.test(facing)?-1:/down/i.test(facing)?1:0;
  const angle=Math.atan2(dy,dx),px=(x-cameraX)*scale,py=(y-cameraY)*scale;
  context.save();context.strokeStyle=kind==='block'?'#bceaf3':'#fff2d0';context.lineWidth=Math.max(1,scale*1.5);
  if(kind==='dodge')context.setLineDash([3*scale,3*scale]);
  context.beginPath();
  if(kind==='block')context.arc(px,py-5*scale,12*scale,angle-Math.PI/3,angle+Math.PI/3);
  else context.ellipse(px,py,10*scale,4*scale,0,0,Math.PI*2);
  context.stroke();context.restore();
}

/** Angular summon rune is deliberately distinct from circular damage markers.
 * It represents an authoritative pending spawn, never a damaging region. */
export function drawOutdoorSummonMark(context:CanvasRenderingContext2D,x:number,y:number,tick:bigint,startedTick:bigint,
  cameraX:number,cameraY:number,scale:number):void {
  const px=(x-cameraX)*scale,py=(y-cameraY)*scale,r=12*scale;
  const progress=Math.max(0,Math.min(1,Number(tick-startedTick)/20));
  context.save();context.lineWidth=Math.max(1,scale);context.strokeStyle='#bceaf3';context.fillStyle='rgba(72,142,151,0.25)';
  context.beginPath();context.moveTo(px,py-r);context.lineTo(px+r,py);context.lineTo(px,py+r);context.lineTo(px-r,py);context.closePath();context.fill();context.stroke();
  context.beginPath();context.moveTo(px-r*.5,py);context.lineTo(px+r*.5,py);context.moveTo(px,py-r*.5);context.lineTo(px,py+r*.5);context.stroke();
  context.fillStyle='#bceaf3';context.fillRect(px-r,py+r+3*scale,2*r*progress,2*scale);context.restore();
}

/** A small crown identifies the guardian without an extra area-of-effect ring.
 * Phase pips brighten briefly at a transition without a flash or camera movement. */
export function drawWardenCrest(context:CanvasRenderingContext2D,x:number,y:number,phase:number,cueUntilTick:bigint,tick:bigint,
  cameraX:number,cameraY:number,scale:number):void {
  const px=(x-cameraX)*scale,py=(y-cameraY)*scale;
  context.save();context.strokeStyle='#f2c56d';context.fillStyle='rgba(129,57,32,0.3)';context.lineWidth=Math.max(1,scale);
  context.beginPath();context.moveTo(px-10*scale,py+4*scale);context.lineTo(px-10*scale,py-2*scale);
  context.lineTo(px-5*scale,py+scale);context.lineTo(px,py-4*scale);context.lineTo(px+5*scale,py+scale);
  context.lineTo(px+10*scale,py-2*scale);context.lineTo(px+10*scale,py+4*scale);context.closePath();context.fill();context.stroke();
  for(let index=0;index<3;index++){
    const cx=px+(index-1)*7*scale,cy=py+7*scale;
    context.beginPath();context.moveTo(cx,cy);context.lineTo(cx+2*scale,cy+3*scale);context.lineTo(cx-2*scale,cy+3*scale);context.closePath();
    if(index<phase){context.fillStyle=cueUntilTick>tick?'#fff2d0':'#f2c56d';context.fill();}else context.stroke();
  }
  context.restore();
}
