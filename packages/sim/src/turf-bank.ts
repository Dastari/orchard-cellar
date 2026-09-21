export const TURF_BANK_CROPS = [[48,48],[64,32],[64,48],[80,16],[48,16],[48,64],[64,0],[64,64],
  [48,0],[80,0],[48,32],[80,32]] as const;
/** Expand coarse occupancy into 2x2 cells: every outjut and return has native room. */
export function turfBankMask(left:number,top:number,rows:readonly (readonly[number,number])[]):ReadonlySet<string>{
 const cells=new Set<string>();
 rows.forEach(([start,end],row)=>{for(let x=start*2;x<=(end+1)*2-1;x++)for(let dy=0;dy<2;dy++)cells.add(`${left+x},${top+row*2+dy}`);});
 return cells;
}
export function resolveTurfBank(mask:ReadonlySet<string>):readonly {tileX:number;tileY:number;frame:number}[]{
 const result:{tileX:number;tileY:number;frame:number}[]=[];
 const has=(x:number,y:number)=>mask.has(`${x},${y}`);
 for(const key of mask){
  const [x,y]=key.split(',').map(Number) as [number,number];
  const n=has(x,y-1),e=has(x+1,y),s=has(x,y+1),w=has(x-1,y);
  if((!n&&!s)||(!e&&!w))throw new Error(`Turf bank needs two-cell returns at ${key}`);
  let frame:number|null;
  if(!n)frame=!w?0:!e?2:1;
  else if(!s)frame=!w?5:!e?7:6;
  else if(!w)frame=3;
  else if(!e)frame=4;
  else {
   const missing=[[1,1,8],[-1,1,9],[1,-1,10],[-1,-1,11]].filter(([dx,dy])=>!has(x+dx!,y+dy!));
   if(missing.length>1)throw new Error(`Unsupported turf concavity at ${key}`);
   frame=missing[0]?.[2]??null;
  }
  if(frame!==null)result.push({tileX:x,tileY:y,frame});
 }
 return result;
}
