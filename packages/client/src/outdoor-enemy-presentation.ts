import {runtimeHearthEnemyDefinition,type ContentRegistry} from '@orchard/sim';

export interface OutdoorEnemyPresentation {
  readonly definitionId:string;
  readonly displayName:string;
  readonly warden:boolean;
}

/** Resolves durable outdoor profile kinds through active authored enemy
 * identity. Missing, retired, or ambiguous legacy kinds receive no special
 * presentation or interaction capability. */
export function outdoorEnemyPresentation(
  registry:ContentRegistry,
  enemyKind:string,
):OutdoorEnemyPresentation|null {
  const definition=runtimeHearthEnemyDefinition(registry,enemyKind);
  return definition===null?null:{
    definitionId:definition.definitionId,
    displayName:definition.displayName,
    warden:definition.behavior.engine==='warden',
  };
}

export function outdoorWardenDisplayName(
  presentation:OutdoorEnemyPresentation,
  phase:number,
):string {
  const numeral=['I','II','III'][Math.max(0,Math.min(2,phase-1))]??'I';
  return `${presentation.displayName} / ${numeral}`;
}
