import {WorldLightingRenderer} from '/packages/engine/src/world-lighting-renderer.ts';
try {
  const canvas=globalThis.document.createElement('canvas');canvas.width=canvas.height=512;
  const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;
  context.fillStyle='#222';context.fillRect(0,0,512,512);
  const field=globalThis.document.createElement('canvas');field.width=field.height=256;
  const f=field.getContext('2d'),pixels=f.createImageData(256,256);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){const i=(y*256+x)*4;pixels.data.set([x,y,128,255],i);}
  f.putImageData(pixels,0,0);
  const sprite=globalThis.document.createElement('canvas');sprite.width=8;sprite.height=6;
  const s=sprite.getContext('2d');s.fillStyle='#fff';s.fillRect(0,0,8,6);s.clearRect(0,0,1,1);
  const world=new WorldLightingRenderer({width:16,height:16,baseDatum:0});
  // Isolate affine sampling from field generation; use the real CPU groundSource.
  world.plane=()=>({canvas:field,left:0,top:0,step:1});
  const source={image:sprite,x:0,y:0,width:8,height:6};
  const cases=[{a:1,b:0,c:0,d:1},{a:0,b:1,c:-1,d:0},{a:0,b:-1,c:1,d:0},
    {a:-1,b:0,c:0,d:1},{a:2,b:0,c:0,d:2},{a:0,b:-2,c:-2,d:0},{a:1,b:0,c:0,d:1}];
  let first,checks=0;
  for(const [index,basis] of cases.entries()){
    const lit=world.groundSource(source,80,80,0,basis),result=lit.image.getContext('2d').getImageData(0,0,8,6).data;
    for(let y=0;y<6;y++)for(let x=0;x<8;x++){
      const i=(y*8+x)*4;if(x===0&&y===0){if(result[i+3]!==0)throw new Error('transparent source became opaque');continue;}
      const expected=[80+basis.a*(x+.5)+basis.c*(y+.5)-.5,80+basis.b*(x+.5)+basis.d*(y+.5)-.5,128];
      for(let c=0;c<3;c++){if(Math.abs(result[i+c]-expected[c])>2)throw new Error(`affine ${index} pixel ${x},${y} channel${c}: ${result[i+c]} != ${expected[c]}`);checks++;}
    }
    if(index===0)first=Array.from(result);
    if(index===6&&first.some((v,i)=>v!==result[i]))throw new Error('transform leaked into following identity sprite');
    context.drawImage(lit.image,0,0,8,6,20+(index%3)*160,20+Math.floor(index/3)*160,128,96);
  }
  for(const basis of [{a:0,b:0,c:0,d:0},{a:Infinity,b:0,c:0,d:1}]){
    let rejected=false;try{world.groundSource(source,80,80,0,basis);}catch{rejected=true;}
    if(!rejected)throw new Error('invalid basis accepted');
  }
  await globalThis.fetch('/__login-result',{method:'POST',body:JSON.stringify({png:canvas.toDataURL(),seed:0,resources:0,decorations:0,draws:7,checks})});
}catch(error){await globalThis.fetch('/__login-result',{method:'POST',body:JSON.stringify({error:String(error),stack:error?.stack})});}
