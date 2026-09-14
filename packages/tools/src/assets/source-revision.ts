import {createHash} from 'node:crypto';
import {OMIT_ATLAS_FORMAT} from './omit-atlas-page.js';
export const ATLAS_CATEGORY_SCHEMA_VERSION=3;
/** Keep exporters and atlas generation on the same exact ordered source snapshot. */
export function atlasSourceRevision(assets:unknown,palette:unknown,seasons:unknown):string {
  return createHash('sha256').update(JSON.stringify({assets,palette,seasons,
    categorySchema:ATLAS_CATEGORY_SCHEMA_VERSION,omitFormat:OMIT_ATLAS_FORMAT})).digest('hex').slice(0,20);
}
