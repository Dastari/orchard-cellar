import {expect,it} from 'vitest';
import {groundLightTextureCoordinates,type WebGLGroundField} from './world-pass-webgl.js';
import {WorldGeometry} from './geometry.js';
it('submits independent reflected and rotated light coordinates to all six actual quad vertices',()=>{
  const field={left:0,top:0,width:100,height:100,step:1} as WebGLGroundField;
  const light=groundLightTextureCoordinates({field,worldX:40,worldY:50,basis:{a:0,b:-2,c:-2,d:0}},10,5);
  expect(light).toEqual([.4,.5,.4,.3,.3,.5,.3,.3]);
  const geometry=Object.create(WorldGeometry.prototype) as WorldGeometry,vertices=new Float32Array(66);
  Reflect.set(geometry,'count',0);Reflect.set(geometry,'vertices',vertices);
  geometry.quad([0,0,10,5],[0,0,1,1],[1,1,1,1],light,2,{matrix:[1,0,0,1,0,0],alpha:1,composite:'source-over',smooth:false,fill:'#fff',clip:null});
  for(const [i,corner] of [0,1,2,2,1,3].entries()){
    expect(vertices[i*11+8]).toBeCloseTo(light[corner*2]!);expect(vertices[i*11+9]).toBeCloseTo(light[corner*2+1]!);
  }
  expect(groundLightTextureCoordinates({field,worldX:40,worldY:50},10,5)).toEqual([.4,.5,.5,.5,.4,.55,.5,.55]);
});
