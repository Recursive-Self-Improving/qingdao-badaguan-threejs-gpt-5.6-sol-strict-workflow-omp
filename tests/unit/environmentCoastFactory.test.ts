import { DirectionalLight, HemisphereLight, InstancedMesh, Mesh, ShaderMaterial } from 'three';
import { describe, expect, it } from 'vitest';

import { APP_CONFIG, COAST_CONFIG, ENVIRONMENT_CONFIG } from '../../src/app/config';
import { ResourceRegistry } from '../../src/render/ResourceRegistry';
import { createCoast } from '../../src/world/coast/createCoast';
import { DISTRICT_DATA } from '../../src/world/districtData';
import { createEnvironment } from '../../src/world/environment/createEnvironment';
import { createStreetNetwork } from '../../src/world/streets/createStreetNetwork';

const HIGH_STANDARD = Object.freeze({ density: 'high' as const, motion: 'standard' as const });
const LOW_REDUCED = Object.freeze({ density: 'low' as const, motion: 'reduced' as const });

function deeplyFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(deeplyFrozen);
}

describe('C07 environment and coast factories', () => {
  it('publishes immutable calibrated morning light, fog, quality, and five-view contracts', () => {
    expect(deeplyFrozen(ENVIRONMENT_CONFIG)).toBe(true);
    expect(deeplyFrozen(COAST_CONFIG)).toBe(true);
    expect(ENVIRONMENT_CONFIG.cameraViews.map(({ id }) => id)).toEqual([
      'spawn', 'deep-shade', 'uphill-vista', 'landmark', 'shore',
    ]);
    expect(ENVIRONMENT_CONFIG.fog.near).toBeGreaterThan(60);
    expect(ENVIRONMENT_CONFIG.quality.high.shadowMapSize).toBeGreaterThan(ENVIRONMENT_CONFIG.quality.medium.shadowMapSize);
    expect(ENVIRONMENT_CONFIG.quality.medium.shadowMapSize).toBeGreaterThan(ENVIRONMENT_CONFIG.quality.low.shadowMapSize);
    for (const quality of Object.values(ENVIRONMENT_CONFIG.quality)) {
      expect(quality.exposure).toBeGreaterThanOrEqual(1);
      expect(quality.exposure).toBeLessThanOrEqual(1.1);
      expect(Math.abs(quality.shadowBias)).toBeLessThan(0.001);
      expect(quality.shadowNormalBias).toBeGreaterThan(0);
      expect(quality.shadowNormalBias).toBeLessThan(0.07);
    }
  });

  it('creates soft sun and fill lights with quality-aware shadow calibration and no leaked resources', () => {
    const resources = new ResourceRegistry();
    const high = createEnvironment(resources, 'environment-high', HIGH_STANDARD);
    const low = createEnvironment(resources, 'environment-low', LOW_REDUCED);
    const sun = high.root.getObjectByName('environment:morning-sun');
    const fill = high.root.getObjectByName('environment:hemisphere-fill');
    expect(sun).toBeInstanceOf(DirectionalLight);
    expect(fill).toBeInstanceOf(HemisphereLight);
    expect((sun as DirectionalLight).castShadow).toBe(true);
    expect((sun as DirectionalLight).shadow.mapSize.toArray()).toEqual([2048, 2048]);
    expect(high.metrics).toMatchObject({ quality: 'high', motion: 'standard', shadowMapSize: 2048, contactGrounding: true });
    expect(low.metrics).toMatchObject({ quality: 'low', motion: 'reduced', shadowMapSize: 512, contactGrounding: true });
    expect(high.metrics.sunDirection[1]).toBeLessThan(0);
    expect(resources.getCounts().resources).toBeGreaterThan(0);
    resources.disposeGroup('environment-high');
    resources.disposeGroup('environment-low');
    expect(resources.getCounts()).toMatchObject({ resources: 0, references: 0, groups: 0 });
  });

  it('owns promenade, beach, fogged water horizon, and screen exactly once outside streets', () => {
    const resources = new ResourceRegistry();
    const streets = createStreetNetwork(resources, 'streets');
    const coast = createCoast(resources, 'coast', HIGH_STANDARD);
    expect(streets.getObjectByName('street:coastal-promenade')).toBeUndefined();
    expect(streets.getObjectByName('street:noncollidable-sea')).toBeUndefined();
    expect(streets.getObjectByName('street:coastal-view-screen')).toBeUndefined();
    expect(streets.getObjectByName('street:public-green-entrance-aprons')).toBeUndefined();
    const intersections = streets.getObjectByName('street:road-intersections') as Mesh;
    expect(intersections.userData.intersectionCount).toBe(
      DISTRICT_DATA.roads.filter(({ orientation }) => orientation === 'east-west').length
        * DISTRICT_DATA.roads.filter(({ orientation }) => orientation === 'north-south').length,
    );
    expect((streets.getObjectByName('street:sidewalks') as Mesh).receiveShadow).toBe(false);
    expect((streets.getObjectByName('street:roads') as Mesh).receiveShadow).toBe(true);
    expect(coast.root.getObjectByName('coast:promenade')).toBeInstanceOf(Mesh);
    expect(coast.root.getObjectByName('coast:restrained-beach')).toBeInstanceOf(Mesh);
    expect(coast.root.userData.horizonLayer).toBe('fogged-water-extension');
    expect(coast.root.getObjectByName('coast:view-screen')).toBeInstanceOf(InstancedMesh);
    const water = coast.root.getObjectByName('coast:water') as Mesh;
    expect(water.material).toBeInstanceOf(ShaderMaterial);
    water.geometry.computeBoundingBox();
    expect((water.geometry.boundingBox?.max.y ?? 0) - (water.geometry.boundingBox?.min.y ?? 0)).toBeGreaterThan(APP_CONFIG.camera.far);
    expect(DISTRICT_DATA.coast.promenade.id).toBe('coastal-promenade');
    resources.disposeGroup('streets');
    resources.disposeGroup('coast');
    expect(resources.getCounts()).toMatchObject({ resources: 0, references: 0, groups: 0 });
  });

  it('animates restrained deterministic water while reduced and low modes remain still', () => {
    const resources = new ResourceRegistry();
    const standard = createCoast(resources, 'coast-standard', HIGH_STANDARD);
    const reduced = createCoast(resources, 'coast-reduced', LOW_REDUCED);
    const standardInitial = standard.metrics.waterTransformChecksum;
    const reducedInitial = reduced.metrics.waterTransformChecksum;
    standard.update({ elapsedSeconds: 7.25, deltaSeconds: 1 / 60 });
    reduced.update({ elapsedSeconds: 7.25, deltaSeconds: 1 / 60 });
    expect(standard.metrics.waterMotionAmplitude).toBeGreaterThan(0);
    expect(standard.metrics.waterTransformChecksum).not.toBe(standardInitial);
    expect(reduced.metrics.waterMotionAmplitude).toBe(0);
    expect(reduced.metrics.waterTransformChecksum).toBe(reducedInitial);
    standard.setCaptureTime(7.25);
    const frozen = standard.metrics.waterTransformChecksum;
    standard.update({ elapsedSeconds: 12, deltaSeconds: 1 / 60 });
    expect(standard.metrics.waterTransformChecksum).toBe(frozen);
    standard.reset();
    expect(standard.metrics.waterTransformChecksum).toBe(standardInitial);
    resources.disposeAll();
  });
});
