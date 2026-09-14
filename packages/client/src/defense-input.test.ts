import {describe,it,expect} from 'vitest';
import {DefenseHoldInput} from './defense-input.js';
describe('held defense input',()=>{
  it('ignores a delayed rejection from an earlier press and renews the newer lease',async()=>{
    const requests:{action:string;reject:(error:Error)=>void}[]=[],errors:unknown[]=[];
    const input=new DefenseHoldInput(action=>new Promise<void>((_resolve,reject)=>requests.push({action,reject})),error=>errors.push(error));
    const aim={x:1,y:0};input.update(true,aim,0);input.release();input.update(true,aim,10);
    requests[0]!.reject(new Error('old rejection'));await Promise.resolve();
    input.update(true,aim,260);
    expect(requests.map(row=>row.action)).toEqual(['block','release','block','block']);expect(errors).toEqual([]);
  });
  it('stops refreshes after current rejection until a fresh press, and releases once when unavailable',async()=>{
    const requests:string[]=[];const input=new DefenseHoldInput(async action=>{
      requests.push(action);if(action==='block')throw new Error('shield_required');
    },()=>{});
    const aim={x:0,y:1};input.update(true,aim,0);await Promise.resolve();
    input.update(true,aim,1000);input.update(false,aim,1001);input.update(false,aim,1002);
    input.update(true,aim,1003);expect(requests).toEqual(['block','release','block']);
  });
});
