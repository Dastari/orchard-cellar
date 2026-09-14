import {describe,expect,it} from 'vitest';
import {bootstrapContentRegistry} from './content/bootstrap-registry.js';
import type {SpaceContentDefinition,SpaceLandmarkDefinition} from './content/world-definition.js';
import {activeSpaceGroundWalkableTiles} from './landmark-ground-walkable.js';
import {createSurvivalAuthoredLandmarkInstances} from './map-document-v3.js';
import {activeSurvivalLandmarks,generateSurvivalLandmarkDecorations} from './survival-world.js';

const bootstrap=bootstrapContentRegistry();
const island=[...bootstrap.spaces.values()].find(space=>space.spaceId===0)!;
const dockLandmark=island.landmarks!.find(landmark=>landmark.groundWalkableAreas!==undefined)!;
const expected=[{tileX:407,tileY:317},{tileX:408,tileY:317},{tileX:409,tileY:317}];
const registryWith=(...spaces:SpaceContentDefinition[])=>({spaces:new Map(spaces.map(space=>[space.id,space]))});

describe('active authored ground-walkable areas',()=>{
  it('projects the existing three tiles from active content with and without a persisted map',()=>{
    expect(activeSpaceGroundWalkableTiles(bootstrap,0)).toEqual(expected);
    expect(activeSpaceGroundWalkableTiles(bootstrap,0,
      createSurvivalAuthoredLandmarkInstances(activeSurvivalLandmarks(bootstrap,0)))).toEqual(expected);
  });

  it('follows a moved stable source across arbitrary landmark and decoration renames',()=>{
    const area=dockLandmark.groundWalkableAreas![0]!;
    const renamed:SpaceLandmarkDefinition={...dockLandmark,id:'renamed_waterfront',label:'Renamed Waterfront',
      decorations:dockLandmark.decorations.map(rule=>rule.kind==='point'&&rule.layer==='ground'
        &&rule.tileX>=area.minimumTileX&&rule.tileX<=area.maximumTileX
        &&rule.tileY>=area.minimumTileY&&rule.tileY<=area.maximumTileY
        ?{...rule,decorationKind:'moonlit_walkway'}:rule)};
    const renamedSpace:SpaceContentDefinition={...island,id:'space:renamed_island',landmarks:[renamed]};
    const authoredAnchor=generateSurvivalLandmarkDecorations([renamed]).find(decoration=>decoration.layer==='ground'
      &&decoration.tileX===area.minimumTileX&&decoration.tileY===area.minimumTileY)!;
    const instances=createSurvivalAuthoredLandmarkInstances([renamed]);
    const moved=instances.map(instance=>instance.sourceDecorationId===authoredAnchor.id
      ?{...instance,groupId:'unrelated_editor_name',kind:'renamed_again',tileX:instance.tileX+10,tileY:instance.tileY-7}
      :instance);
    expect(activeSpaceGroundWalkableTiles(registryWith(renamedSpace),0,moved)).toEqual([
      {tileX:417,tileY:310},{tileX:418,tileY:310},{tileX:419,tileY:310},
    ]);
  });

  it('fails neutral for suppression, stale or duplicate instances, and ambiguous authored anchors',()=>{
    const instances=createSurvivalAuthoredLandmarkInstances([dockLandmark]);
    const source=generateSurvivalLandmarkDecorations([dockLandmark]).find(decoration=>decoration.layer==='ground'
      &&decoration.tileX===407&&decoration.tileY===317)!.id;
    const anchor=instances.find(instance=>instance.sourceDecorationId===source)!;
    const only=registryWith({...island,landmarks:[dockLandmark]});
    expect(activeSpaceGroundWalkableTiles(only,0,instances.map(instance=>instance===anchor
      ?{...instance,enabled:false}:instance))).toEqual([]);
    expect(activeSpaceGroundWalkableTiles(only,0,instances.filter(instance=>instance!==anchor))).toEqual([]);
    expect(activeSpaceGroundWalkableTiles(only,0,[...instances,{...anchor,id:'duplicate-editor-row'}])).toEqual([]);
    const ambiguous={...dockLandmark,id:'ambiguous_copy'};
    expect(activeSpaceGroundWalkableTiles(registryWith({...island,landmarks:[dockLandmark,ambiguous]}),0,instances))
      .toEqual([]);
  });

  it('fails neutral for missing, retired, or ambiguous active spaces',()=>{
    expect(activeSpaceGroundWalkableTiles(registryWith(),0)).toEqual([]);
    expect(activeSpaceGroundWalkableTiles(registryWith({...island,retired:true}),0)).toEqual([]);
    expect(activeSpaceGroundWalkableTiles(registryWith(island,{...island,id:'space:duplicate_island'}),0)).toEqual([]);
  });
});
