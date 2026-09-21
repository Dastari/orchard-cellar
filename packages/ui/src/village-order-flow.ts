export interface VillageOrderOffer {
  readonly id:string;readonly title:string;readonly npcId:bigint;readonly itemKind:string;readonly quantity:number;
  readonly saleValueBronze:bigint;readonly bonusBronze:bigint;readonly totalBronze:bigint;
  readonly revision:bigint;readonly contentHash:string;
  readonly milestoneTitle?:string;readonly milestoneProgress?:string;readonly learnedMeals?:readonly string[];
}
const sameQuote=(a:VillageOrderOffer,b:VillageOrderOffer)=>a.id===b.id&&a.npcId===b.npcId&&a.itemKind===b.itemKind
  &&a.quantity===b.quantity&&a.saleValueBronze===b.saleValueBronze&&a.bonusBronze===b.bonusBronze
  &&a.totalBronze===b.totalBronze&&a.revision===b.revision&&a.contentHash===b.contentHash;
function deliveryFailure(error:unknown):string{
  const message=error instanceof Error?error.message:'';
  const hints:Readonly<Record<string,string>>={
    order_changed:'Orders changed. Review again.',order_content_changed:'Orders changed. Review again.',
    order_quote_changed:'Price changed. Review again.',sale_quantity_missing:'Not enough goods in your bags.',
    merchant_out_of_range:'Return to the merchant to deliver.',merchant_dialogue_not_open:'Reopen the merchant conversation.',
    order_wrong_merchant:'This merchant needs different goods.',wallet_full:'Your purse cannot hold the payment.',
    descent_inventory_locked:'Finish your Delve before delivering.',player_not_alive:'Recover before delivering.',
  };
  return Object.entries(hints).find(([code])=>message.includes(code))?.[1]??'Delivery failed. Review again.';
}
/** Keeps a review frozen. A promise acknowledgement is not an authoritative
 * receipt; another connection can also advance the shared order revision. */
export class VillageOrderFlow {
  private scope:string|null=null;
  private npcId:bigint|null=null;
  private serial=0;
  private current:readonly VillageOrderOffer[]=[];
  private reviewed:VillageOrderOffer|null=null;
  private inFlight=false;
  private message='';
  get offers(){return this.current;}
  get review(){return this.reviewed;}
  get pending(){return this.inFlight;}
  get notice(){return this.message;}
  get milestone(){return this.current[0]??null;}
  update(scope:string|null,npcId:bigint|null,offers:readonly VillageOrderOffer[]):void{
    const changedScope=scope!==this.scope||npcId!==this.npcId;
    if(changedScope){
      this.serial++;this.inFlight=false;this.reviewed=null;this.message='';this.scope=scope;this.npcId=npcId;
    }
    const previousMeals=changedScope?undefined:this.current[0]?.learnedMeals;
    this.current=scope===null||npcId===null?[]:offers.filter(offer=>offer.npcId===npcId);
    const learned=previousMeals===undefined?[]:(this.current[0]?.learnedMeals??[]).filter(id=>!previousMeals.includes(id));
    const learnedNotice=learned.length?`Learned: ${learned.map(id=>id==='pantry_lunch'?'Pantry Lunch':'Cellar Supper').join(', ')}`:'';
    if(learnedNotice)this.message=learnedNotice;
    if(!this.reviewed)return;
    const next=this.current.find(offer=>offer.id===this.reviewed!.id);
    if(next&&sameQuote(this.reviewed,next))return;
    // Never infer our own success from a revision another connection may move.
    this.serial++;this.reviewed=null;this.inFlight=false;this.message=learnedNotice||(this.current.length===0?'Orders unavailable. Check again.':'Orders updated. Review again.');
  }
  select(id:string):boolean{
    if(this.inFlight)return false;
    const offer=this.current.find(offer=>offer.id===id);if(!offer)return false;
    this.reviewed=Object.freeze({...offer});this.message='';return true;
  }
  cancel():boolean{
    if(this.inFlight)return false;
    this.reviewed=null;this.message='';return true;
  }
  async deliver(send:(offer:VillageOrderOffer)=>Promise<void>):Promise<boolean>{
    if(this.inFlight||this.reviewed===null||this.scope===null)return false;
    const offer=this.reviewed,current=this.current.find(row=>row.id===offer.id);
    if(!current||!sameQuote(offer,current))return false;
    const serial=++this.serial;this.inFlight=true;this.message='Delivering...';
    try{
      await send(offer);
      if(serial===this.serial)this.message='Waiting for updated orders...';
      return true;
    }catch(error){
      if(serial===this.serial){
        this.inFlight=false;this.reviewed=null;
        // Rejection requires a new explicit review, never rebasing/resending.
        this.message=deliveryFailure(error);
      }
      return false;
    }
  }
}
