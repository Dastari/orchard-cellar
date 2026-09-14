import type {GroundSpriteBasis} from './ground-light-source.js';
import type {LightSpriteOccluder} from './light-occlusion.js';
/** Transform an anchor-relative native alpha mask into a world-space receiver.
 * Pixel centres use inverse nearest-neighbour sampling, just like native art.
 * Identity instances share immutable alpha storage rather than copying trees. */
export function transformedLightSprite(mask:LightSpriteOccluder,basis:GroundSpriteBasis,
  contactX:number,contactY:number):LightSpriteOccluder{
  const determinant=basis.a*basis.d-basis.b*basis.c;
  if(!Number.isFinite(determinant)||determinant===0||!Number.isFinite(contactX)||!Number.isFinite(contactY))throw new Error('invalid_light_sprite_transform');
  if(basis.a===1&&basis.b===0&&basis.c===0&&basis.d===1)return {...mask,left:contactX+mask.left,top:contactY+mask.top};
  const corners=[[mask.left,mask.top],[mask.left+mask.width,mask.top],
    [mask.left,mask.top+mask.height],[mask.left+mask.width,mask.top+mask.height]];
  const xs=corners.map(([x,y])=>contactX+basis.a*x!+basis.c*y!),ys=corners.map(([x,y])=>contactY+basis.b*x!+basis.d*y!);
  const left=Math.floor(Math.min(...xs)),top=Math.floor(Math.min(...ys));
  const width=Math.ceil(Math.max(...xs))-left,height=Math.ceil(Math.max(...ys))-top;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>4_194_304)throw new Error('light_sprite_transform_budget');
  const opaque=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const dx=left+x+.5-contactX,dy=top+y+.5-contactY;
    const sourceX=Math.floor((basis.d*dx-basis.c*dy)/determinant-mask.left);
    const sourceY=Math.floor((-basis.b*dx+basis.a*dy)/determinant-mask.top);
    if(sourceX>=0&&sourceX<mask.width&&sourceY>=0&&sourceY<mask.height)opaque[y*width+x]=mask.opaque[sourceY*mask.width+sourceX]!;
  }
  return {...mask,left,top,width,height,opaque};
}

/** Bounded native-alpha cache. World position and receiver plane do not own
 * transformed pixels. Fractional contacts retain the exact uncached sampler,
 * because translating a raster by a fraction changes pixel-centre coverage. */
export class TransformedLightSpriteCache {
  private readonly identities=new WeakMap<Uint8Array,number>();
  private nextIdentity=0;
  private readonly entries=new Map<string,LightSpriteOccluder>();
  private bytes=0;
  constructor(private readonly byteBudget=8*1024*1024){
    if(!Number.isSafeInteger(byteBudget)||byteBudget<0)throw new Error('invalid_light_sprite_cache_budget');
  }
  transform(mask:LightSpriteOccluder,basis:GroundSpriteBasis,contactX:number,contactY:number):LightSpriteOccluder{
    if(!Number.isSafeInteger(contactX)||!Number.isSafeInteger(contactY)
      ||(basis.a===1&&basis.b===0&&basis.c===0&&basis.d===1))return transformedLightSprite(mask,basis,contactX,contactY);
    let identity=this.identities.get(mask.opaque);
    if(identity===undefined){identity=++this.nextIdentity;this.identities.set(mask.opaque,identity);}
    const key=[identity,mask.left,mask.top,mask.width,mask.height,basis.a,basis.b,basis.c,basis.d].join(':');
    let cached=this.entries.get(key);
    if(cached!==undefined){this.entries.delete(key);this.entries.set(key,cached);}
    else{
      cached=transformedLightSprite(mask,basis,0,0);
      if(cached.opaque.byteLength<=this.byteBudget){
        while(this.bytes+cached.opaque.byteLength>this.byteBudget){
          const oldest=this.entries.keys().next().value!;
          this.bytes-=this.entries.get(oldest)!.opaque.byteLength;
          this.entries.delete(oldest);
        }
        this.entries.set(key,cached);this.bytes+=cached.opaque.byteLength;
      }
    }
    return {...mask,left:contactX+cached.left,top:contactY+cached.top,
      width:cached.width,height:cached.height,opaque:cached.opaque};
  }
  clear():void{this.entries.clear();this.bytes=0;}
}
