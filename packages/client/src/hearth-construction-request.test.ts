import {expect,it} from 'vitest';
import {HearthConstructionRequest} from './hearth-construction-request.js';
it('waits for authority and ignores late failures across revisions and A-B-A scopes',()=>{
  const requests=new HearthConstructionRequest();
  expect(requests.begin()).toBeNull();
  requests.sync('a',7n);const first=requests.begin()!;
  requests.sync('a',7n);expect(requests.begin()).toBeNull();
  requests.sync('a',8n);expect(requests.pending).toBe(false);
  requests.sync('b',0n);requests.sync('a',8n);const next=requests.begin()!;
  expect(requests.fail(first.token)).toBe(false);expect(requests.pending).toBe(true);
  expect(requests.fail(next.token)).toBe(true);expect(requests.pending).toBe(false);
  const retry=requests.begin()!;expect(retry.token).not.toBe(next.token);
  requests.sync('a',null);expect(requests.begin()).toBeNull();expect(requests.fail(retry.token)).toBe(false);
});
