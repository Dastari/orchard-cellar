/** Keep a submitted edit pending until authoritative saved state changes. A late
 * response from another home/session must never unlock a newer request. */
export class HearthConstructionRequest {
  private scope='';
  private revision:bigint|null=null;
  private sequence=0;
  private active:number|null=null;
  get pending():boolean{return this.active!==null;}
  sync(scope:string,revision:bigint|null):void{
    if(scope!==this.scope||revision!==this.revision)this.active=null;
    this.scope=scope;this.revision=revision;
  }
  begin():{token:number;revision:bigint}|null {
    if(this.pending||this.revision===null)return null;
    this.active=++this.sequence;
    return {token:this.active,revision:this.revision};
  }
  fail(token:number):boolean{
    if(this.active!==token)return false;
    this.active=null;return true;
  }
}
