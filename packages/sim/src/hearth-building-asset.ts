/** Minimal structural asset contract consumed by offline map authoring. */
export interface HearthBuildingAsset{
  readonly id:number;
  readonly width:number;
  readonly height:number;
  readonly anchor:readonly [number,number];
}
