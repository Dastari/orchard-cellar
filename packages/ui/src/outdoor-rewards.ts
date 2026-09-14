import {drawPixelText,type PixelUi} from './pixel-ui.js';
import {drawButton} from './button.js';
import {containsPoint,type UiPoint,type UiRect} from './geometry.js';
import {ScrollBar} from './scrollbar.js';
import type {UiSkin} from './skin.js';

export interface OutdoorRewardEntry {
  readonly id:string;readonly title:string;readonly experience:number;readonly valid:boolean;
  readonly items:readonly {readonly itemKind:string;readonly label:string;readonly quantity:number}[];
}
export function outdoorRewardsLayout(frame:UiRect){
  const padding=16,buttonHeight=28,gap=6,innerWidth=Math.max(120,frame.width-padding*2);
  const sideWidth=Math.min(72,Math.floor(innerWidth*.22));
  const previous={x:frame.x+padding,y:frame.y+frame.height-42,width:sideWidth,height:buttonHeight};
  const next={...previous,x:frame.x+frame.width-padding-sideWidth};
  const collect={...previous,x:previous.x+sideWidth+gap,width:innerWidth-sideWidth*2-gap*2};
  const list={x:frame.x+padding,y:frame.y+72,width:innerWidth,height:Math.max(20,frame.height-138)};
  return {previous,next,collect,list,visibleRows:Math.max(1,Math.floor(list.height/22)),
    scroll:{x:list.x+list.width-12,y:list.y,width:12,height:list.height}};
}

/** Item receipts remain authoritative until collection succeeds. This window
 * never removes inventory or receipt rows locally, including on failed retries. */
export class OutdoorRewards {
  private entries:readonly OutdoorRewardEntry[]=[];
  private selectedId:string|null=null;
  private blocked=false;
  private pendingId:string|null=null;
  private collectedId:string|null=null;
  private error='';
  private request=0;
  private readonly scroll:ScrollBar;
  constructor(private readonly skin:UiSkin,private readonly fonts:PixelUi,
    private readonly claim:(id:string)=>Promise<void>,
    private readonly drawItem:(context:CanvasRenderingContext2D,rect:UiRect,kind:string)=>void){this.scroll=new ScrollBar(skin);}
  update(entries:readonly OutdoorRewardEntry[],blocked=false):void {
    this.blocked=blocked;
    if(this.entries===entries)return;
    this.entries=entries;
    if(!entries.some(row=>row.id===this.selectedId)){this.selectedId=entries[0]?.id??null;this.scroll.setPosition(0);this.error='';}
    if(this.pendingId!==null&&!entries.some(row=>row.id===this.pendingId)){this.pendingId=null;this.request++;}
    if(this.collectedId!==null&&!entries.some(row=>row.id===this.collectedId))this.collectedId=null;
  }
  private selected(){return this.entries.find(row=>row.id===this.selectedId);}
  private page(delta:number):void {
    const index=this.entries.findIndex(row=>row.id===this.selectedId),next=Math.max(0,Math.min(this.entries.length-1,index+delta));
    this.selectedId=this.entries[next]?.id??null;this.scroll.setPosition(0);this.error='';
  }
  private collect():void {
    const entry=this.selected();
    if(entry===undefined||!entry.valid||this.blocked||this.pendingId!==null||this.collectedId===entry.id)return;
    const request=++this.request;this.pendingId=entry.id;this.error='';
    void Promise.resolve().then(()=>this.claim(entry.id)).then(()=>{
      if(request!==this.request)return;this.pendingId=null;this.collectedId=entry.id;
    }).catch((error:unknown)=>{
      if(request!==this.request)return;this.pendingId=null;
      const message=error instanceof Error?error.message:String(error);
      this.error=message.includes('reward_inventory_full')?'MAKE SPACE IN YOUR BAGS, THEN RETRY.'
        :message.includes('descent_inventory_locked')?'COLLECT AFTER LEAVING THE DELVE.':'COULD NOT COLLECT. PLEASE TRY AGAIN.';
    });
  }
  private sync(frame:UiRect){const layout=outdoorRewardsLayout(frame);this.scroll.setMetrics(this.selected()?.items.length??0,layout.visibleRows);this.scroll.setBounds(layout.scroll);return layout;}
  handleKeyDown(code:string,frame:UiRect):boolean {
    this.sync(frame);
    if(code==='ArrowLeft'){this.page(-1);return true;}if(code==='ArrowRight'){this.page(1);return true;}
    if(code==='Enter'){this.collect();return true;}return this.scroll.handleKey(code);
  }
  pointerDown(point:UiPoint,button:number,frame:UiRect,pointerType?:string):boolean {
    if(button!==0)return false;const layout=this.sync(frame);
    if(containsPoint(layout.previous,point)){this.page(-1);return true;}
    if(containsPoint(layout.next,point)){this.page(1);return true;}
    if(containsPoint(layout.collect,point)){this.collect();return true;}
    if(this.scroll.pointerDown(point))return true;
    if(pointerType==='touch'&&containsPoint(layout.list,point))return this.scroll.beginSwipe(point,layout.list,pointerType);
    return containsPoint(layout.list,point);
  }
  pointerMove(point:UiPoint,frame:UiRect):void {this.sync(frame);this.scroll.pointerMove(point);this.scroll.swipeMove(point,22);}
  pointerUp():boolean {const drag=this.scroll.pointerUp(),swipe=this.scroll.endSwipe();return drag||swipe;}
  pointerLeave():void {this.scroll.pointerLeave();}
  wheel(point:UiPoint,deltaY:number,frame:UiRect):boolean {const layout=this.sync(frame);return containsPoint(layout.list,point)&&this.scroll.wheel(deltaY);}
  draw(context:CanvasRenderingContext2D,frame:UiRect):void {
    const layout=this.sync(frame),entry=this.selected(),width=Math.max(1,Math.floor((frame.width-40)/6));
    const text=(value:string,x:number,y:number,color='#4d2e22')=>drawPixelText(context,this.fonts,value.slice(0,width),x,y,{color});
    if(entry===undefined){text('NO RESERVED REWARDS',frame.x+18,frame.y+40);text('CLEAR CAMPS TO EARN MATERIALS.',frame.x+18,frame.y+57);return;}
    text(entry.title.toUpperCase(),frame.x+18,frame.y+34);
    text(`${entry.experience} COMBAT XP ALREADY EARNED`,frame.x+18,frame.y+47,'#6b4428');
    text(`REWARD ${this.entries.findIndex(row=>row.id===entry.id)+1} OF ${this.entries.length}`,frame.x+18,frame.y+60,'#6b4428');
    context.save();context.beginPath();context.rect(layout.list.x,layout.list.y,layout.list.width-14,layout.list.height);context.clip();
    entry.items.slice(this.scroll.position,this.scroll.position+layout.visibleRows).forEach((item,index)=>{
      const y=layout.list.y+index*22;this.drawItem(context,{x:layout.list.x,y,width:20,height:20},item.itemKind);
      text(`${item.quantity} ${item.label.toUpperCase()}`.slice(0,Math.floor((layout.list.width-40)/6)),layout.list.x+25,y+6);
    });
    if(!entry.valid)text('REWARD DATA UNAVAILABLE',layout.list.x,layout.list.y+4);
    else if(entry.items.length===0)text('NO ITEMS IN THIS CLEAR.',layout.list.x,layout.list.y+4);
    context.restore();this.scroll.draw(context);
    text(this.error||(this.blocked?'COLLECT AFTER LEAVING THE DELVE.':'ITEMS STAY SAVED UNTIL COLLECTED.'),frame.x+18,layout.collect.y-15,this.error?'#9b352d':'#6b4428');
    const index=this.entries.findIndex(row=>row.id===entry.id);
    drawButton(context,this.skin,this.fonts,layout.previous,{label:'PREV',state:index===0?'disabled':'idle'});
    drawButton(context,this.skin,this.fonts,layout.next,{label:'NEXT',state:index===this.entries.length-1?'disabled':'idle'});
    const disabled=this.blocked||!entry.valid||this.pendingId!==null||this.collectedId===entry.id;
    drawButton(context,this.skin,this.fonts,layout.collect,{label:this.pendingId===entry.id?'COLLECTING':this.collectedId===entry.id?'COLLECTED':entry.items.length===0?'DISMISS':'COLLECT',tone:'success',state:disabled?'disabled':'idle'});
  }
}
