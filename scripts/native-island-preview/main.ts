import {loadGeneratedAsset,loadGeneratedAssetRegistry,type LoadedAsset} from '../../packages/ui/src/index.js';
import {serializeMapDocumentV3} from '../../packages/sim/src/index.js';
import {loadMapEditorArt} from '../../packages/engine/src/overworld-art.js';
import {createNativeIslandRenderer,type Mode} from './core.js';
import {cinderwakeDesign,willowharbourDesign,type NativeIslandScene} from '../native-island-scenes.js';

const canvas=document.querySelector<HTMLCanvasElement>('#scene')!;
const status=document.querySelector<HTMLElement>('#status')!;
const views=document.querySelector<HTMLSelectElement>('#view')!;
const modes=document.querySelector<HTMLSelectElement>('#lighting')!;
const scenes=[cinderwakeDesign(),willowharbourDesign()];
const assets=new Map<string,LoadedAsset>();
let current=scenes[0]!;
const art=await loadMapEditorArt(undefined!,undefined!);
await Promise.all([...new Set(scenes.flatMap(scene=>scene.placements.map(p=>p.asset)))].map(async name=>{
  const asset=await loadGeneratedAsset(name);
  if(asset.name!==name)throw new Error(`Missing registered art: ${name}`);
  assets.set(name,asset);
}));
const registry=await loadGeneratedAssetRegistry();
const {render,editable}=createNativeIslandRenderer(art,assets,String(registry.revision));
function context(surface:HTMLCanvasElement){const ctx=surface.getContext('2d')!;ctx.imageSmoothingEnabled=false;return ctx;}
function surface(width:number,height:number){const c=document.createElement('canvas');c.width=width;c.height=height;return c;}
function display(){
  const full=render(current,modes.value as Mode),view=current.views.find(v=>v.id===views.value);
  const crop=view??{x:0,y:0,width:full.width,height:full.height};
  const zoom=view?2:1;canvas.width=crop.width*zoom;canvas.height=crop.height*zoom;
  context(canvas).drawImage(full,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);
  canvas.setAttribute('aria-label',`${current.title}, ${views.value}, ${modes.value}`);
  status.textContent=`${current.title} · ${current.placements.length.toLocaleString()} registered native placements`;
}
function select(scene:NativeIslandScene){current=scene;views.replaceChildren(...[{id:'overview'},...scene.views].map(view=>{const o=document.createElement('option');o.value=view.id;o.textContent=view.id.replaceAll('-',' ');return o;}));
  for(const s of scenes)document.getElementById(s.id)!.setAttribute('aria-pressed',String(s===scene));display();}
for(const scene of scenes)document.getElementById(scene.id)!.onclick=()=>select(scene);
views.onchange=display;modes.onchange=display;

async function save(name:string,png?:HTMLCanvasElement,json?:unknown){const response=await fetch('/__native-evidence',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,...(png?{png:png.toDataURL('image/png')}:{}),...(json?{json}:{})})});if(!response.ok)throw new Error(await response.text());}
async function exportEvidence(){
  for(const scene of scenes){
    const full=render(scene,'day');await save(`${scene.id}-overview`,full);
    for(const view of scene.views){const c=surface(view.width*2,view.height*2);context(c).drawImage(full,view.x,view.y,view.width,view.height,0,0,c.width,c.height);await save(`${scene.id}-${view.id}`,c);}
    if(scene.id==='cinderwake')for(const mode of ['night-off','night-self','night-glow'] as const)await save(`${scene.id}-${mode}`,render(scene,mode));
    await save(`${scene.id}-map`,undefined,editable(scene));
    await save(`${scene.id}-design`,undefined,{id:scene.id,intendedTerraces:scene.intendedTerraces,placements:scene.placements,note:'Visual draft. All placement elevation is zero; terrace profiles and continuous traversal are pending implementation.'});
  }
  status.textContent='Both islands, detail views, night comparisons and editable maps saved.';
  return {saved:true,assets:assets.size,scenes:scenes.map(s=>({id:s.id,placements:s.placements.length}))};
}
document.getElementById('export')!.onclick=()=>{void exportEvidence().catch(error=>status.textContent=String(error));};
document.getElementById('download')!.onclick=()=>{const blob=new Blob([serializeMapDocumentV3(editable(current))],{type:'application/json'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${current.id}-native-visual-draft.map.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
(window as unknown as {nativeIslands:unknown}).nativeIslands={exportEvidence,render,scenes,select,editable};
select(current);
