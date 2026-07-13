import { Group } from 'three';
import { ATMOSPHERE_CONFIG } from '../app/config';
import { resolveNavigation } from '../exploration/navigation';
import type { ResourceRegistry } from '../render/ResourceRegistry';
import { DISTRICT_DATA } from './districtData';
import { createStreetNetwork } from './streets/createStreetNetwork';
import { createGroundSurfaceMaterial, createTerrain, sampleGroundHeight } from './terrain/createTerrain';
import { createWorldDebug } from './debug/createWorldDebug';
import { createVillaKit } from './architecture/villaKit';
import { createVillaDistrict } from './architecture/createVillas';
import { createLandmarks } from './architecture/createLandmarks';
import { createLandscape } from './landscape/createLandscape';
import { createEnvironment } from './environment/createEnvironment';
import { createCoast } from './coast/createCoast';
import type { AtmosphereConfig, LandscapeSettings, WorldBuildResult } from './types';
const DEFAULT_LANDSCAPE_SETTINGS: LandscapeSettings = Object.freeze({
  density: 'high',
  motion: 'standard',
});


export function createWorld(
  resources: ResourceRegistry,
  group: string,
  settings: LandscapeSettings = DEFAULT_LANDSCAPE_SETTINGS,
  atmosphere: AtmosphereConfig = ATMOSPHERE_CONFIG,
): WorldBuildResult {
  const root = new Group();
  root.name = 'badaguan-district';
  const environment = createEnvironment(resources, group, settings, atmosphere);
  root.add(environment.root);
  const groundMaterial = createGroundSurfaceMaterial(resources, group);
  root.add(createTerrain(resources, group, groundMaterial));
  root.add(createStreetNetwork(resources, group, groundMaterial));
  const coast = createCoast(resources, group, settings, DISTRICT_DATA, atmosphere);
  root.add(coast.root);
  const villaKit = createVillaKit(resources, group);
  createVillaDistrict(villaKit, DISTRICT_DATA.architectureSites);
  createLandmarks(villaKit, DISTRICT_DATA.architectureSites);
  const architecture = villaKit.finalize();
  root.add(architecture.root);
  const landscape = createLandscape(resources, group, settings, DISTRICT_DATA);
  root.add(landscape.root);
  const debug = createWorldDebug(resources, group, landscape.debugLayout);
  root.add(debug.root);
  return Object.freeze({
    root,
    data: DISTRICT_DATA,
    debug,
    architecture,
    landscape,
    environment,
    coast,
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
