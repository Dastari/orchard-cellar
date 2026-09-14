import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {LEGACY_LANDMARK_ASSET_NAMES} from './legacy-landmark-assets.js';

it('preserves the exact legacy landmark asset compatibility catalog',()=>{
  expect(Object.keys(LEGACY_LANDMARK_ASSET_NAMES)).toHaveLength(33);
  expect(createHash('sha256').update(JSON.stringify(LEGACY_LANDMARK_ASSET_NAMES)).digest('hex'))
    .toBe('b1e0d63d1626068dc15df1def42f6452818fdaef18f9b9d904007280747a8c0d');
});
