/** Import only the ten reviewed village facades at native resolution.
 * Reproduce: npx tsx packages/tools/src/import-hearth-buildings.ts
 */
import {existsSync} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../../..');
const sources = [
  ['inn', 'Houses/Wood/House_5_Wood_Base_Red.png', 192,128,88,111],
  ['general_store', 'Houses/Wood/House_2_Wood_Base_Red.png',144,128,40,111],
  ['carpenter', 'Houses/Wood/House_3_Wood_Base_Blue.png',144,128,88,111],
  ['furnisher', 'Houses/Limestone/House_4_Limestone_Base_Red.png',112,96,40,79],
  ['smith', 'Unique_Buildings/Blacksmith_House/Blacksmith_House_Black.png',160,128,40,111],
  ['guild', 'Houses/Limestone/House_3_Limestone_Base_Blue.png',144,128,88,111],
  ['garden_cottage', 'Houses/Wood/House_1_Wood_Base_Red.png',96,128,40,111],
  ['orchard_cottage', 'Houses/Wood/House_4_Wood_Green_Blue.png',112,96,40,79],
  ['barn', 'Unique_Buildings/Barn/Barn_Base_Black.png',128,144,64,127],
  ['greenhouse', 'Unique_Buildings/Greenhouse/GreenHouse_Green.png',96,128,48,111],
] as const;
for (const [id, source, width, height, anchorX, anchorY] of sources) {
  const name = `building_cf_hearth_${id}`;
  const file = resolve(root, `packages/assets/buildings/${name}.sprite.json`);
  const previous=existsSync(file)?JSON.parse(await readFile(file,'utf8')) as Record<string,unknown>:null;
  execFileSync(resolve(root,'node_modules/.bin/tsx'), [
    'packages/tools/src/import-image.ts', `references/art/kenmi/cute-fantasy/core/Buildings/Buildings/${source}`,
    '--size', `${width}x${height}`, '--source-size', `${width}x${height}`, '--crop', '0,0',
    '--name', name, '--category', 'buildings',
  ], { cwd: root, stdio: 'inherit' });
  const asset = JSON.parse(await readFile(file,'utf8')) as Record<string,unknown>;
  asset['anchor'] = [anchorX,anchorY];
  if(previous?.['approved']===true&&JSON.stringify({...previous,approved:false})===JSON.stringify({...asset,approved:false})) asset['approved']=true;
  await writeFile(file, `${JSON.stringify(asset,null,2)}\n`);
}
