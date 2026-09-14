import { runtimeItemDefinition } from '@orchard/sim';
import type { OutdoorRewardEntry } from '@orchard/ui';

interface Receipt { readonly id:string; readonly completionId:string; readonly itemsJson:string; readonly combatExperience:number; }
type Registry = Parameters<typeof runtimeItemDefinition>[0];

/** Parse receipts only when their subscription or item definitions change. */
export class OutdoorRewardsModel {
  private source:Iterable<Receipt>|undefined;
  private revision:number|undefined;
  private registry:Registry|undefined;
  private result:readonly OutdoorRewardEntry[]=[];
  entries(source:Iterable<Receipt>|undefined,revision:number|undefined,registry:Registry):readonly OutdoorRewardEntry[] {
    if(source===this.source&&revision!==undefined&&revision===this.revision&&registry===this.registry)return this.result;
    this.source=source;this.revision=revision;this.registry=registry;
    this.result=Array.from(source??[],row=>{
      const title=row.completionId.replace(/:\d+$/,'').replace(/^cinder-/,'').replaceAll('-',' ');
      const entry={id:row.id,title,experience:row.combatExperience};
      try {
        const raw:unknown=JSON.parse(row.itemsJson);
        if(!Array.isArray(raw)||raw.length>16)throw new Error('invalid receipt');
        const items=raw.map((value:unknown)=>{
          if(typeof value!=='object'||value===null||!('itemKind' in value)||!('quantity' in value)
            ||typeof value.itemKind!=='string'||typeof value.quantity!=='number'
            ||!Number.isInteger(value.quantity)||value.quantity<1||value.quantity>16_000)throw new Error('invalid item');
          const definition=runtimeItemDefinition(registry,value.itemKind);
          if(definition===null)throw new Error('unknown item');
          return {itemKind:value.itemKind,label:definition.displayName,quantity:value.quantity};
        });
        return {...entry,items,valid:true};
      } catch {return {...entry,items:[],valid:false};}
    });
    return this.result;
  }
}
