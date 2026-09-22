/** A functional resource keeps its server ID and harvest state when moved. */
export interface MapResourcePlacement {
  readonly id: string;
  readonly originTileX: number;
  readonly originTileY: number;
  readonly tileX: number;
  readonly tileY: number;
}

export function parseMapResourcePlacements(value: unknown, width: number, height: number): readonly MapResourcePlacement[] {
  if (!Array.isArray(value) || value.length > 100_000) throw new TypeError('invalid_map_resource_placements');
  const ids=new Set<string>();
  const result=value.map((entry: unknown):MapResourcePlacement=>{
    if (!entry || typeof entry!=='object' || Array.isArray(entry)) throw new TypeError('invalid_map_resource_placement');
    const row=entry as Record<string,unknown>;
    if(typeof row['id']!=='string'||!/^[1-9][0-9]{0,19}$/u.test(row['id'])||BigInt(row['id'])>0xffff_ffff_ffff_ffffn||ids.has(row['id']))throw new TypeError('invalid_map_resource_id');
    ids.add(row['id']);
    for(const [key,limit] of [['tileX',width],['originTileX',width],['tileY',height],['originTileY',height]] as const) {
      const coordinate=row[key];if(typeof coordinate!=='number'||!Number.isInteger(coordinate)||coordinate<0||coordinate>=limit)throw new TypeError('invalid_map_resource_position');
    }
    return {id:row['id'],originTileX:row['originTileX'] as number,originTileY:row['originTileY'] as number,tileX:row['tileX'] as number,tileY:row['tileY'] as number};
  });
  return result.sort((a,b)=>a.id.localeCompare(b.id));
}
