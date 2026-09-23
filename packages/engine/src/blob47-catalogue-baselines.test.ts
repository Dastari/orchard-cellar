import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import baseline from './blob47-catalogue-baselines.json' with { type: 'json' };
import { blobLayerBaselineOutputs } from './blob47-catalogue-baselines.js';
describe(`farmland/fringe layer parity (${baseline.source})`,()=>{
 const outputs=blobLayerBaselineOutputs();
 it('keeps the complete probe inventory',()=>expect(Object.keys(outputs)).toEqual(Object.keys(baseline.hashes)));
 for(const [id,hash] of Object.entries(baseline.hashes)) it(id,()=>expect(createHash('sha256').update(JSON.stringify(outputs[id])).digest('hex')).toBe(hash));
});
