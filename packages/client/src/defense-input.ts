export interface DefenseAim { readonly x:number;readonly y:number; }
type SendDefense=(action:'block'|'release',aim:DefenseAim)=>Promise<void>;
/** An old rejected refresh must not poison a newer press after release. */
export class DefenseHoldInput {
  private held=false;
  private rejected=false;
  private generation=0;
  private refreshedAt=0;
  constructor(private readonly send:SendDefense,private readonly onError:(error:unknown)=>void) {}
  release():void {
    if(!this.held)return;
    this.held=false;this.rejected=false;this.generation++;
    void this.send('release',{x:0,y:1}).catch(()=>undefined);
  }
  update(held:boolean,aim:DefenseAim,now:number):void {
    if(!held){this.release();return;}
    if(this.held&&(this.rejected||now-this.refreshedAt<250))return;
    if(!this.held)this.generation++;
    this.held=true;this.refreshedAt=now;
    const generation=this.generation;
    void this.send('block',aim).catch((error:unknown)=>{
      if(!this.held||generation!==this.generation)return;
      this.rejected=true;this.onError(error);
    });
  }
}
