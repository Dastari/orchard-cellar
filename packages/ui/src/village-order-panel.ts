import {drawPixelText,measurePixelText,type PixelUi} from './pixel-ui.js';
import {drawUiSkinAsset,type UiSkin} from './skin.js';
import type {UiRect} from './geometry.js';
import {Ribbon} from './ribbon.js';
import type {VillageOrderFlow} from './village-order-flow.js';
export function villageOrderLayout(width:number,height:number){
  const frame={x:8,y:8,width:width-16,height:height-16};
  const bottom=frame.y+frame.height-30;
  return {frame,close:{x:frame.x+frame.width-25,y:frame.y+5,width:20,height:20},
    rows:Array.from({length:3},(_,i)=>({x:frame.x+10,y:frame.y+30+i*32,width:frame.width-20,height:30})),
    back:{x:frame.x+10,y:bottom,width:100,height:24},deliver:{x:frame.x+frame.width-130,y:bottom,width:120,height:24},noticeY:bottom-12};
}
export function drawVillageOrderPanel(ctx:CanvasRenderingContext2D,skin:UiSkin,fonts:PixelUi,flow:VillageOrderFlow,width:number,height:number,itemName:(kind:string)=>string){
  const l=villageOrderLayout(width,height);
  drawUiSkinAsset(ctx,skin.panelWood,l.frame);new Ribbon(skin.banner,fonts).draw(ctx,'VILLAGE ORDERS',width/2,l.frame.y-5);
  const text=(value:string,x:number,y:number,max=width-40,color='#fff1d2')=>{
    let shown=value;while(shown.length&&measurePixelText(shown,1,fonts.font)>max)shown=shown.slice(0,-1);
    drawPixelText(ctx,fonts,shown,x,y,{color});
  };
  const button=(rect:UiRect,label:string,confirm=false,disabled=false)=>{
    drawUiSkinAsset(ctx,disabled?skin.buttonDeny:confirm?skin.buttonConfirm:skin.button,rect,'idle');
    drawPixelText(ctx,fonts,label,rect.x+rect.width/2,rect.y+7,{align:'center',color:confirm||disabled?'#fff1d2':'#51351f'});
  };
  button(l.close,'X');
  const review=flow.review;
  if(review){
    const x=l.frame.x+12,y=l.frame.y+31;
    text('YOU DELIVER',x,y);text(`${review.quantity} ${itemName(review.itemKind)}`,x,y+14);
    text(`SALE VALUE: ${review.saleValueBronze} BRONZE`,x,y+33);
    text(`ORDER BONUS: ${review.bonusBronze} BRONZE`,x,y+47);
    text(`YOU RECEIVE: ${review.totalBronze} BRONZE`,x,y+61);
    button(l.deliver,flow.pending?'PENDING':'DELIVER',true,flow.pending);
  }else{
    flow.offers.slice(0,3).forEach((offer,i)=>{
      const row=l.rows[i]!;drawUiSkinAsset(ctx,skin.button,row,'idle');
      text(`${i+1}. ${offer.quantity} ${itemName(offer.itemKind)}`,row.x+7,row.y+4,row.width-14,'#51351f');
      text(`Receive ${offer.totalBronze} bronze`,row.x+7,row.y+14,row.width-14,'#51351f');
    });
    if(flow.offers.length===0)text('No orders available.',l.frame.x+12,l.frame.y+40);
  }
  text(flow.notice,l.frame.x+12,l.noticeY);
  button(l.back,review&&!flow.pending?'BACK':'CLOSE');
}
