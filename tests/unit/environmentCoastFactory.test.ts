import { BufferGeometry, DataTexture, DirectionalLight, HemisphereLight, InstancedMesh, Mesh, MeshLambertMaterial, ShaderMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { APP_CONFIG, ATMOSPHERE_CONFIG } from '../../src/app/config';
import { ResourceRegistry } from '../../src/render/ResourceRegistry';
import { createCoast } from '../../src/world/coast/createCoast';
import { DISTRICT_DATA } from '../../src/world/districtData';
import { createEnvironment } from '../../src/world/environment/createEnvironment';
import { createStreetNetwork } from '../../src/world/streets/createStreetNetwork';
import { createGroundSurfaceMaterial, createTerrain, GROUND_SURFACE_COLOR } from '../../src/world/terrain/createTerrain';
import type { AtmosphereConfig } from '../../src/world/types';

const HIGH_STANDARD = Object.freeze({ density: 'high' as const, motion: 'standard' as const });
const LOW_REDUCED = Object.freeze({ density: 'low' as const, motion: 'reduced' as const });

const INJECTED_ATMOSPHERE: AtmosphereConfig = Object.freeze({
  ...ATMOSPHERE_CONFIG,
  sky: Object.freeze({ ...ATMOSPHERE_CONFIG.sky, horizon: 0x123456 }),
  fog: Object.freeze({ color: 0xfedcba, near: 19, far: 87 }),
  quality: Object.freeze({
    ...ATMOSPHERE_CONFIG.quality,
    high: Object.freeze({ ...ATMOSPHERE_CONFIG.quality.high, shadowMapSize: 512, waterSegments: 4 }),
  }),
  coast: Object.freeze({
    ...ATMOSPHERE_CONFIG.coast,
    horizonColor: 0xe12a8f,
    shallowWaterColor: 0x234567,
    midWaterColor: 0x345678,
    wetSandColor: 0xabcdef,
    foamColor: 0x123abc,
    shoreBlendDistance: 9.5,
    shoreFoamStart: 0.8,
    shoreFoamEnd: 2.2,
    horizonFadeStart: 65,
    horizonFadeEnd: 410,
    staticDetailStrength: 0.19,
    standardMotionAmplitude: 0.111,
    reducedMotionAmplitude: 0.027,
  }),
});

function deeplyFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(deeplyFrozen);
}

describe('C07 environment and coast factories', () => {
  it('publishes immutable calibrated morning light, fog, quality, and five-view contracts', () => {
    expect(deeplyFrozen(ATMOSPHERE_CONFIG)).toBe(true);
    expect(ATMOSPHERE_CONFIG.cameraViews.map(({ id }) => id)).toEqual([
      'spawn', 'deep-shade', 'uphill-vista', 'landmark', 'shore',
    ]);
    expect(ATMOSPHERE_CONFIG.fog.color).toBe(0xb9c0bb);
    expect(ATMOSPHERE_CONFIG.sky.horizon).toBe(0x7c867f);
    expect(ATMOSPHERE_CONFIG.coast.horizonColor).toBe(ATMOSPHERE_CONFIG.sky.horizon);
    expect(ATMOSPHERE_CONFIG.coast.horizonFadeStart).toBeGreaterThan(0);
    expect(ATMOSPHERE_CONFIG.coast.horizonFadeEnd).toBeLessThan(APP_CONFIG.camera.far);
    expect(ATMOSPHERE_CONFIG.coast.shoreBlendDistance).toBeGreaterThan(0);
    expect(ATMOSPHERE_CONFIG.fog.near).toBeGreaterThan(60);
    expect(ATMOSPHERE_CONFIG.quality.high.shadowMapSize).toBeGreaterThan(ATMOSPHERE_CONFIG.quality.medium.shadowMapSize);
    expect(ATMOSPHERE_CONFIG.quality.medium.shadowMapSize).toBeGreaterThan(ATMOSPHERE_CONFIG.quality.low.shadowMapSize);
    for (const quality of Object.values(ATMOSPHERE_CONFIG.quality)) {
      expect(quality.exposure).toBeGreaterThanOrEqual(1);
      expect(quality.exposure).toBeLessThanOrEqual(1.1);
      expect(quality.fogNearMultiplier).toBeGreaterThan(0);
      expect(quality.fogFarMultiplier).toBeGreaterThan(0);
      expect(quality.ambientMultiplier).toBeGreaterThan(0);
      expect(quality.shadowBias).toBeLessThanOrEqual(0);
      expect(Math.abs(quality.shadowBias)).toBeLessThan(0.001);
      expect(quality.shadowNormalBias).toBeGreaterThan(0);
      expect(quality.shadowNormalBias).toBeLessThan(0.03);
    }
    expect(ATMOSPHERE_CONFIG.fog.far * ATMOSPHERE_CONFIG.quality.low.fogFarMultiplier)
      .toBeGreaterThan(ATMOSPHERE_CONFIG.fog.far * ATMOSPHERE_CONFIG.quality.high.fogFarMultiplier);
  });

  it('creates soft sun and fill lights with quality-aware shadow calibration and no leaked resources', () => {
    const resources = new ResourceRegistry();
    const high = createEnvironment(resources, 'environment-high', HIGH_STANDARD, ATMOSPHERE_CONFIG);
    const low = createEnvironment(resources, 'environment-low', LOW_REDUCED, ATMOSPHERE_CONFIG);
    const sun = high.root.getObjectByName('environment:morning-sun');
    const fill = high.root.getObjectByName('environment:hemisphere-fill');
    expect(sun).toBeInstanceOf(DirectionalLight);
    expect(fill).toBeInstanceOf(HemisphereLight);
    expect((sun as DirectionalLight).castShadow).toBe(true);
    expect((sun as DirectionalLight).shadow.mapSize.toArray()).toEqual([2048, 2048]);
    expect((sun as DirectionalLight).shadow.bias).toBe(ATMOSPHERE_CONFIG.quality.high.shadowBias);
    expect((sun as DirectionalLight).shadow.normalBias).toBe(ATMOSPHERE_CONFIG.quality.high.shadowNormalBias);
    expect((fill as HemisphereLight).intensity).toBeCloseTo(1.42 * ATMOSPHERE_CONFIG.quality.high.ambientMultiplier);
    const sky = high.backgroundTexture as DataTexture;
    const skyData = sky.image.data as Uint8Array;
    expect(high.metrics.skyGradientRows).toBe(256);
    expect(sky.image).toMatchObject({ width: 1, height: 256 });
    expect(Array.from(skyData.slice(0, 3))).toEqual([0x7c, 0x86, 0x7f]);
    expect(Array.from(skyData.slice(127 * 4, 127 * 4 + 3))).toEqual([0x7c, 0x86, 0x7f]);
    expect(Array.from(skyData.slice(128 * 4, 128 * 4 + 3))).toEqual([0x7c, 0x86, 0x7f]);
    expect(Array.from(skyData.slice((256 - 1) * 4, (256 - 1) * 4 + 3))).toEqual([0x78, 0x95, 0xa8]);
    let longestIdenticalRun = 1;
    let identicalRun = 1;
    for (let row = 1; row < 256; row += 1) {
      const offset = row * 4;
      const previous = offset - 4;
      if (skyData[offset] === skyData[previous]
        && skyData[offset + 1] === skyData[previous + 1]
        && skyData[offset + 2] === skyData[previous + 2]) {
        identicalRun += 1;
        longestIdenticalRun = Math.max(longestIdenticalRun, identicalRun);
      } else {
        identicalRun = 1;
      }
    }
    expect(longestIdenticalRun).toBeLessThan(16);
    expect(high.metrics).toMatchObject({ quality: 'high', motion: 'standard', fogNear: 80, fogFar: 380, shadowMapSize: 2048, contactGrounding: true });
    expect(low.metrics).toMatchObject({ quality: 'low', motion: 'reduced', fogNear: 108, shadowMapSize: 512, contactGrounding: true });
    expect(low.metrics.fogFar).toBeCloseTo(437);
    expect(low.metrics.ambientIntensity).toBeGreaterThan(high.metrics.ambientIntensity);
    expect(high.metrics.sunDirection[1]).toBeLessThan(0);
    expect(resources.getCounts().resources).toBeGreaterThan(0);
    resources.disposeGroup('environment-high');
    resources.disposeGroup('environment-low');
    expect(resources.getCounts()).toMatchObject({ resources: 0, references: 0, groups: 0 });
  });

  it('shares one fogged lit ground material across shadow-receiving terrain and sidewalks', () => {
    const resources = new ResourceRegistry();
    const groundMaterial = createGroundSurfaceMaterial(resources, 'streets');
    const terrain = createTerrain(resources, 'streets', groundMaterial);
    const streets = createStreetNetwork(resources, 'streets', groundMaterial);
    const coast = createCoast(resources, 'coast', HIGH_STANDARD, DISTRICT_DATA, ATMOSPHERE_CONFIG);
    const terrainSurface = terrain.getObjectByName('district-terrain') as Mesh;
    const sidewalks = streets.getObjectByName('street:sidewalks') as Mesh;
    expect(groundMaterial).toBeInstanceOf(MeshLambertMaterial);
    expect(groundMaterial.fog).toBe(true);
    expect(groundMaterial.emissive.getHex()).toBe(GROUND_SURFACE_COLOR);
    expect(groundMaterial.emissiveIntensity).toBe(0.035);
    expect(terrainSurface.material).toBe(groundMaterial);
    expect(sidewalks.material).toBe(groundMaterial);
    expect(terrainSurface.receiveShadow).toBe(true);
    expect(sidewalks.receiveShadow).toBe(true);
    expect(streets.getObjectByName('street:coastal-promenade')).toBeUndefined();
    expect(streets.getObjectByName('street:noncollidable-sea')).toBeUndefined();
    expect(streets.getObjectByName('street:coastal-view-screen')).toBeUndefined();
    expect(streets.getObjectByName('street:public-green-entrance-aprons')).toBeUndefined();
    const intersections = streets.getObjectByName('street:road-intersections') as Mesh;
    expect(intersections.userData.intersectionCount).toBe(
      DISTRICT_DATA.roads.filter(({ orientation }) => orientation === 'east-west').length
        * DISTRICT_DATA.roads.filter(({ orientation }) => orientation === 'north-south').length,
    );
    expect((streets.getObjectByName('street:roads') as Mesh).receiveShadow).toBe(true);
    const beach = coast.root.getObjectByName('coast:restrained-beach') as Mesh<BufferGeometry, ShaderMaterial>;
    expect(beach).toBeInstanceOf(Mesh);
    expect(beach.material).toBeInstanceOf(ShaderMaterial);
    expect(beach.material.toneMapped).toBe(false);
    expect(coast.root.children.filter(({ name }) => name === 'coast:restrained-beach')).toHaveLength(1);
    expect(coast.root.children.filter(({ name }) => name === 'coast:water')).toHaveLength(1);
    expect(coast.root.userData.horizonLayer).toBe('fogged-water-extension');
    expect(coast.root.getObjectByName('coast:view-screen')).toBeInstanceOf(InstancedMesh);
    const water = coast.root.getObjectByName('coast:water') as Mesh<BufferGeometry, ShaderMaterial>;
    expect(water.material).toBeInstanceOf(ShaderMaterial);
    expect((water.material.uniforms.wetSandColor?.value as Vector3).toArray()).toEqual([
      0xb3 / 255,
      0x9c / 255,
      0x72 / 255,
    ]);
    expect((water.material.uniforms.shallowWaterColor?.value as Vector3).toArray()).toEqual([
      0x9a / 255,
      0x9b / 255,
      0x82 / 255,
    ]);
    expect((water.material.uniforms.midWaterColor?.value as Vector3).toArray()).toEqual([
      0x67 / 255,
      0x8a / 255,
      0x97 / 255,
    ]);
    expect(water.material.uniforms.staticDetailStrength?.value).toBe(0.16);
    expect((water.material.uniforms.foamColor?.value as Vector3).toArray()).toEqual([
      0xd4 / 255,
      0xc9 / 255,
      0xa8 / 255,
    ]);
    expect((beach.material.uniforms.drySandColor?.value as Vector3).toArray()).toEqual([
      0xb8 / 255,
      0xa9 / 255,
      0x8d / 255,
    ]);
    expect((beach.material.uniforms.wetSandColor?.value as Vector3).toArray())
      .toEqual((water.material.uniforms.wetSandColor?.value as Vector3).toArray());
    expect(water.material.uniforms.shoreBlendDistance?.value).toBe(12);
    expect(water.material.uniforms.shoreFoamStart?.value).toBe(0.72);
    expect(water.material.uniforms.shoreFoamEnd?.value).toBe(1.12);
    expect(water.material.uniforms.waterDepth?.value).toBeGreaterThan(APP_CONFIG.camera.far);
    const beachPositions = beach.geometry.getAttribute('position');
    const waterPositions = water.geometry.getAttribute('position');
    const beachShoreStart = beach.geometry.userData.shorelineVertexStart as number;
    const shorelineCount = beach.geometry.userData.shorelineVertexCount as number;
    expect(shorelineCount).toBe(129);
    expect(water.geometry.userData).toMatchObject({ shorelineVertexStart: 0, shorelineVertexCount: shorelineCount, shorelineSegments: 128, depthSegments: 8 });
    const shorelineDepths = new Set<number>();
    for (let index = 0; index < shorelineCount; index += 1) {
      const beachIndex = beachShoreStart + index;
      expect(waterPositions.getX(index)).toBe(beachPositions.getX(beachIndex));
      expect(waterPositions.getY(index)).toBe(beachPositions.getY(beachIndex));
      expect(waterPositions.getZ(index)).toBe(beachPositions.getZ(beachIndex));
      shorelineDepths.add(Math.round(waterPositions.getZ(index) * 1_000));
    }
    const shorelineRange = Math.max(...shorelineDepths) - Math.min(...shorelineDepths);
    expect(shorelineRange).toBeGreaterThan(5_000);
    expect(shorelineDepths.size).toBeGreaterThan(8);
    expect(water.position.y).toBe(beach.position.y);
    water.geometry.computeBoundingBox();
    expect((water.geometry.boundingBox?.max.z ?? 0) - (water.geometry.boundingBox?.min.z ?? 0)).toBeGreaterThan(APP_CONFIG.camera.far);
    expect(coast.metrics).toMatchObject({ beachLayers: 1, horizonLayers: 1 });
    expect(DISTRICT_DATA.coast.promenade.id).toBe('coastal-promenade');
    resources.disposeGroup('streets');
    resources.disposeGroup('coast');
    expect(resources.getCounts()).toMatchObject({ resources: 0, references: 0, groups: 0 });
  });

  it('animates restrained deterministic water while reduced and low modes remain still', () => {
    const resources = new ResourceRegistry();
    const standard = createCoast(resources, 'coast-standard', HIGH_STANDARD, DISTRICT_DATA, ATMOSPHERE_CONFIG);
    const reduced = createCoast(resources, 'coast-reduced', LOW_REDUCED, DISTRICT_DATA, ATMOSPHERE_CONFIG);
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

  it('derives both environment and coast behavior from one unmistakably nondefault atmosphere', () => {
    const resources = new ResourceRegistry();
    const environment = createEnvironment(resources, 'injected-environment', HIGH_STANDARD, INJECTED_ATMOSPHERE);
    const standard = createCoast(resources, 'injected-standard', HIGH_STANDARD, DISTRICT_DATA, INJECTED_ATMOSPHERE);
    const reduced = createCoast(
      resources,
      'injected-reduced',
      Object.freeze({ density: 'high' as const, motion: 'reduced' as const }),
      DISTRICT_DATA,
      INJECTED_ATMOSPHERE,
    );

    expect(environment.config).toBe(INJECTED_ATMOSPHERE);
    expect(environment).toMatchObject({ backgroundColor: 0x123456, fogColor: 0xfedcba, fogNear: 19, fogFar: 87 });
    expect(environment.metrics).toMatchObject({ shadowMapSize: 512, fogNear: 19, fogFar: 87 });
    const water = standard.root.getObjectByName('coast:water') as Mesh<BufferGeometry, ShaderMaterial>;
    expect(standard.config).toBe(INJECTED_ATMOSPHERE);
    expect((water.material.uniforms.horizonColor?.value as Vector3).toArray()).toEqual([
      0xe1 / 255,
      0x2a / 255,
      0x8f / 255,
    ]);
    expect((water.material.uniforms.wetSandColor?.value as Vector3).toArray()).toEqual([
      0xab / 255,
      0xcd / 255,
      0xef / 255,
    ]);
    expect((water.material.uniforms.shallowWaterColor?.value as Vector3).toArray()).toEqual([
      0x23 / 255,
      0x45 / 255,
      0x67 / 255,
    ]);
    expect((water.material.uniforms.midWaterColor?.value as Vector3).toArray()).toEqual([
      0x34 / 255,
      0x56 / 255,
      0x78 / 255,
    ]);
    expect((water.material.uniforms.foamColor?.value as Vector3).toArray()).toEqual([
      0x12 / 255,
      0x3a / 255,
      0xbc / 255,
    ]);
    expect(water.material.uniforms.shoreBlendDistance?.value).toBe(9.5);
    expect(water.material.uniforms.shoreFoamStart?.value).toBe(0.8);
    expect(water.material.uniforms.shoreFoamEnd?.value).toBe(2.2);
    expect(water.material.uniforms.horizonFadeStart?.value).toBe(65);
    expect(water.material.uniforms.horizonFadeEnd?.value).toBe(410);
    expect(water.material.uniforms.staticDetailStrength?.value).toBe(0.19);
    expect(water.geometry.userData.depthSegments).toBe(4);
    expect(standard.metrics).toMatchObject({ waterSegments: 4, waterMotionAmplitude: 0.111, waterStaticDetailStrength: 0.19, horizonFadeStart: 65, horizonFadeEnd: 410, shoreBlendDistance: 9.5, shoreFoamStart: 0.8, shoreFoamEnd: 2.2 });
    expect(reduced.metrics.waterMotionAmplitude).toBe(0.027);
    resources.disposeAll();
  });
});
