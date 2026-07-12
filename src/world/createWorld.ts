import { Group } from 'three';
import { resolveNavigation } from '../exploration/navigation';
import type { ResourceRegistry } from '../render/ResourceRegistry';
import { DISTRICT_DATA } from './districtData';
import { createStreetNetwork } from './streets/createStreetNetwork';
import { createTerrain, sampleGroundHeight } from './terrain/createTerrain';
import { createWorldDebug } from './debug/createWorldDebug';
import { createVillaKit } from './architecture/villaKit';
import { createVillaDistrict } from './architecture/createVillas';
import { createLandmarks } from './architecture/createLandmarks';
import type { WorldBuildResult } from './types';


export function createWorld(resources: ResourceRegistry, group: string): WorldBuildResult {
  const root = new Group();
  root.name = 'badaguan-district';
  root.add(createTerrain(resources, group));
  root.add(createStreetNetwork(resources, group));
  const villaKit = createVillaKit(resources, group);
  createVillaDistrict(villaKit, DISTRICT_DATA.architectureSites);
  createLandmarks(villaKit, DISTRICT_DATA.architectureSites);
  const architecture = villaKit.finalize();
  root.add(architecture.root);
  const debug = createWorldDebug(resources, group);
  root.add(debug.root);
  return Object.freeze({
    root,
    data: DISTRICT_DATA,
    debug,
    architecture,
    navigation: Object.freeze({
      resolve: resolveNavigation,
      sampleGroundHeight,
      bounds: DISTRICT_DATA.navigableBounds,
      spawn: DISTRICT_DATA.spawn,
      reset: DISTRICT_DATA.reset,
    }),
    recipe: Object.freeze({ id: 'badaguan-district-procedural' as const, version: 1 as const }),
    degradationNotices: Object.freeze([]),
  });
}
