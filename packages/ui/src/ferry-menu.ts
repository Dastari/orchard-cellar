import {hearthFerryDestinations,runtimeHearthFerryNetwork,type HearthFerryDock,
  type HearthFerryRegistry} from '@orchard/sim';
import {drawPixelText,type PixelUi} from './pixel-ui.js';
import {drawButton} from './button.js';
import {containsPoint,type UiPoint,type UiRect} from './geometry.js';
import type {UiSkin} from './skin.js';
export function ferryMenuButtons(frame:UiRect):readonly UiRect[]{
  return [0,1].map(index=>({x:frame.x+20,y:frame.y+90+index*48,width:frame.width-40,height:34}));
}
export class FerryMenu {
  private source:HearthFerryDock='';
  private pending=false;
  private error='';
  constructor(private readonly skin:UiSkin,private readonly fonts:PixelUi,
    private readonly travel:(from:HearthFerryDock,to:HearthFerryDock)=>Promise<void>,private readonly arrived:()=>void,
    private readonly registry:()=>HearthFerryRegistry|undefined){}
  open(source:HearthFerryDock):void {if(!this.pending){this.source=source;this.error='';}}
  private depart(index:number):void {
    const content=this.registry(),network=content===undefined?null:runtimeHearthFerryNetwork(content);
    const destination=network===null?undefined:hearthFerryDestinations(network,this.source)[index];
    if(this.pending||destination===undefined)return;
    this.pending=true;this.error='';
    void Promise.resolve().then(()=>this.travel(this.source,destination.id)).then(()=>{this.pending=false;this.arrived();}).catch((error:unknown)=>{
      this.pending=false;const message=error instanceof Error?error.message:String(error);
      this.error=message.includes('out_of_reach')?'MOVE CLOSER TO THE FERRY.':message.includes('landing_blocked')?'ARRIVAL DOCK BLOCKED. TRY AGAIN.'
        :message.includes('preparing')?'DESTINATION PREPARING. TRY AGAIN.':message.includes('boat_cannot')?'DISEMBARK BEFORE TAKING THE FERRY.':'FERRY UNAVAILABLE. PLEASE TRY AGAIN.';
    });
  }
  key(code:string):boolean {if(code==='Digit1'){this.depart(0);return true;}if(code==='Digit2'){this.depart(1);return true;}return false;}
  pointerDown(point:UiPoint,button:number,frame:UiRect):boolean {
    if(button!==0)return false;const index=ferryMenuButtons(frame).findIndex(rect=>containsPoint(rect,point));
    if(index<0)return false;this.depart(index);return true;
  }
  draw(context:CanvasRenderingContext2D,frame:UiRect):void {
    const text=(value:string,y:number,color='#4d2e22')=>drawPixelText(context,this.fonts,value.slice(0,Math.floor((frame.width-40)/6)),frame.x+20,y,{color});
    const content=this.registry(),network=content===undefined?null:runtimeHearthFerryNetwork(content);
    const source=network?.byId.get(this.source),destinations=network===null?[]:hearthFerryDestinations(network,this.source);
    if(source===undefined){text('FERRY ROUTES UNAVAILABLE.',frame.y+38);return;}
    text(`FROM ${source.name.toUpperCase()}`,frame.y+38);
    text('CHOOSE A DESTINATION. ALL TRIPS FREE.',frame.y+55);
    const buttons=ferryMenuButtons(frame);
    destinations.forEach((destination,index)=>drawButton(context,this.skin,this.fonts,buttons[index]!,{
      label:`${index+1}. ${destination.name.toUpperCase()}`,state:this.pending?'disabled':'idle',
      tone:destination.dangerous?'danger':'success'}));
    text(destinations.some(({dangerous})=>dangerous)?'DANGEROUS DESTINATIONS ARE MARKED.':'SAFE PASSAGE.',frame.y+190);
    text(this.error||(this.pending?'DEPARTING...':'RETURN TRIPS ARE ALWAYS FREE.'),frame.y+210,this.error?'#9b352d':'#6b4428');
  }
}
