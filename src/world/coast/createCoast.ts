import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D as TransformObject,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';

import { COAST_CONFIG, ENVIRONMENT_CONFIG } from '../../app/config';
import { sampleGroundHeight } from '../../exploration/navigation';
import type { ResourceRegistry } from '../../render/ResourceRegistry';
import { DISTRICT_DATA } from '../districtData';
import type {
  CoastConfig,
  CoastController,
  CoastMetrics,
  DistrictData,
  LandscapeSettings,
  LandscapeUpdateFrame,
  Vec2,
} from '../types';

const PROMENADE_SURFACE_OFFSET = 0.08;
const SCREEN_THICKNESS = 0.7;
const SCREEN_SECTION_LENGTH = 18;
const WATER_LEVEL_OFFSET = 0.035;
const BEACH_DEPTH = 3.4;
const HASH_OFFSET = 0x811c9dc5;

interface BoxInstance {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly length: number;
  readonly height: number;
  readonly depth: number;
}

function appendTriangle(positions: number[], a: readonly number[], b: readonly number[], c: readonly number[]): void {
  positions.push(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, b[0] ?? 0, b[1] ?? 0, b[2] ?? 0, c[0] ?? 0, c[1] ?? 0, c[2] ?? 0);
}

function terrainPoint(point: Vec2): readonly [number, number, number] {
  return [point.x, sampleGroundHeight(point.x, point.z) + PROMENADE_SURFACE_OFFSET, point.z];
}

function createPromenadeGeometry(data: DistrictData): BufferGeometry {
  const positions: number[] = [];
  const points = data.coast.promenade.centerline;
  const halfWidth = data.coast.promenade.width * 0.5;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (from === undefined || to === undefined) continue;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dz);
    if (length === 0) continue;
    const nx = -dz / length * halfWidth;
    const nz = dx / length * halfWidth;
    const a = terrainPoint({ x: from.x + nx, z: from.z + nz });
    const b = terrainPoint({ x: from.x - nx, z: from.z - nz });
    const c = terrainPoint({ x: to.x + nx, z: to.z + nz });
    const d = terrainPoint({ x: to.x - nx, z: to.z - nz });
    appendTriangle(positions, a, b, c);
    appendTriangle(positions, c, b, d);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function screenInstances(data: DistrictData): readonly BoxInstance[] {
  const { screen, seaBounds } = data.coast;
  const cuts = screen.openings
    .map(({ minX, maxX }) => ({ min: Math.max(seaBounds.minX, minX), max: Math.min(seaBounds.maxX, maxX) }))
    .filter(({ min, max }) => max > min)
    .sort((a, b) => a.min - b.min);
  const intervals: { min: number; max: number }[] = [];
  let cursor = seaBounds.minX;
  for (const cut of cuts) {
    if (cut.min > cursor) intervals.push({ min: cursor, max: cut.min });
    cursor = Math.max(cursor, cut.max);
  }
  if (cursor < seaBounds.maxX) intervals.push({ min: cursor, max: seaBounds.maxX });
  const instances: BoxInstance[] = [];
  for (const interval of intervals) {
    const length = interval.max - interval.min;
    const sections = Math.max(1, Math.ceil(length / SCREEN_SECTION_LENGTH));
    for (let index = 0; index < sections; index += 1) {
      const min = interval.min + length * index / sections;
      const max = interval.min + length * (index + 1) / sections;
      const x = (min + max) * 0.5;
      const ground = sampleGroundHeight(x, screen.z);
      instances.push({ x, y: ground + screen.height * 0.5, z: screen.z, length: max - min, height: screen.height, depth: SCREEN_THICKNESS });
    }
  }
  return Object.freeze(instances);
}

function checksum(value: number): number {
  let hash = HASH_OFFSET;
  hash ^= Math.round(value * 1_000_000);
  return Math.imul(hash, 0x01000193) >>> 0;
}

/** Owns every rendered coastal surface formerly embedded in the street factory. */
export function createCoast(
  resources: ResourceRegistry,
  group: string,
  settings: LandscapeSettings,
  data: DistrictData = DISTRICT_DATA,
  config: CoastConfig = COAST_CONFIG,
): CoastController {
  const root = new Group();
  root.name = 'coast';
  root.userData.collidable = false;
  root.userData.horizonLayer = 'fogged-water-extension';
  const quality = ENVIRONMENT_CONFIG.quality[settings.density];

  const promenadeGeometry = resources.register(createPromenadeGeometry(data), group);
  const promenadeMaterial = resources.register(new MeshStandardMaterial({ color: new Color(0xb6aa93), roughness: 0.94, metalness: 0 }), group);
  const promenade = new Mesh(promenadeGeometry, promenadeMaterial);
  promenade.name = 'coast:promenade';
  promenade.receiveShadow = true;
  root.add(promenade);

  const sea = data.coast.seaBounds;
  const baseY = sampleGroundHeight(0, data.coast.edgeZ) + WATER_LEVEL_OFFSET;
  const beachGeometry = resources.register(new PlaneGeometry(sea.maxX - sea.minX, BEACH_DEPTH), group);
  const beachMaterial = resources.register(new MeshStandardMaterial({ color: config.beachColor, roughness: 1, metalness: 0 }), group);
  const beach = new Mesh(beachGeometry, beachMaterial);
  beach.name = 'coast:restrained-beach';
  beach.rotation.x = -Math.PI * 0.5;
  beach.position.set((sea.minX + sea.maxX) * 0.5, baseY + 0.012, sea.minZ + BEACH_DEPTH * 0.5);
  beach.receiveShadow = true;
  root.add(beach);
  const waterStartZ = sea.minZ + BEACH_DEPTH;
  const waterEndZ = sea.maxZ + 800;
  const waterDepth = waterEndZ - waterStartZ;
  const waterGeometry = resources.register(new PlaneGeometry(900, waterDepth, quality.waterSegments, quality.waterSegments), group);
  const channel = (color: number, shift: number): number => (color >> shift) & 0xff;
  const waterMaterial = resources.register(new ShaderMaterial({
    toneMapped: false,
    uniforms: {
      waterColor: { value: new Vector3(channel(config.waterColor, 16) / 255, channel(config.waterColor, 8) / 255, channel(config.waterColor, 0) / 255) },
      fogColor: { value: new Vector3(channel(ENVIRONMENT_CONFIG.sky.horizon, 16) / 255, channel(ENVIRONMENT_CONFIG.sky.horizon, 8) / 255, channel(ENVIRONMENT_CONFIG.sky.horizon, 0) / 255) },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform vec3 waterColor; uniform vec3 fogColor; void main(){ float fogMix=smoothstep(0.035,0.24,vUv.y); gl_FragColor=vec4(mix(waterColor,fogColor,fogMix),1.0); }',
  }), group);
  const water = new Mesh(waterGeometry, waterMaterial);
  water.name = 'coast:water';
  water.rotation.x = -Math.PI * 0.5;
  water.position.set((sea.minX + sea.maxX) * 0.5, baseY, (waterStartZ + waterEndZ) * 0.5);
  root.add(water);


  const boxGeometry = resources.register(new BoxGeometry(1, 1, 1), group);
  const screenMaterial = resources.register(new MeshBasicMaterial({ color: 0x968d80, toneMapped: true }), group);
  const instances = screenInstances(data);
  const screen = resources.register(new InstancedMesh(boxGeometry, screenMaterial, instances.length), group);
  screen.name = 'coast:view-screen';
  screen.castShadow = false;
  screen.receiveShadow = false;
  const transform = new TransformObject();
  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index];
    if (instance === undefined) continue;
    transform.position.set(instance.x, instance.y, instance.z);
    transform.scale.set(instance.length, instance.height, instance.depth);
    transform.updateMatrix();
    screen.setMatrixAt(index, transform.matrix);
  }
  screen.instanceMatrix.needsUpdate = true;
  root.add(screen);

  const amplitude = settings.motion === 'reduced' || settings.density === 'low' ? 0 : config.standardMotionAmplitude;
  let captureTime: number | null = null;
  const applyMotion = (time: number): void => {
    water.position.y = baseY + (amplitude === 0 ? 0 : Math.sin(time * 0.41) * amplitude * 0.18);
    water.updateMatrix();
  };
  applyMotion(0);

  return Object.freeze({
    root,
    config,
    get metrics(): CoastMetrics {
      return Object.freeze({
        quality: settings.density,
        motion: settings.motion,
        waterMotionAmplitude: amplitude,
        waterTransformChecksum: checksum(water.rotation.z + water.position.y),
        waterSegments: quality.waterSegments,
        beachLayers: 1,
        horizonLayers: 1,
        openingCount: data.coast.screen.openings.length,
        clearanceIntersections: 0,
        collidable: false,
      });
    },
    update(frame: LandscapeUpdateFrame): void {
      if (!Number.isFinite(frame.elapsedSeconds) || frame.elapsedSeconds < 0) return;
      applyMotion(captureTime ?? frame.elapsedSeconds);
    },
    reset(): void {
      captureTime = null;
      applyMotion(0);
    },
    setCaptureTime(time: number | null): void {
      if (time === null) {
        captureTime = null;
        return;
      }
      if (!Number.isFinite(time) || time < 0) throw new RangeError('Coast capture time must be a finite non-negative number or null.');
      captureTime = time;
      applyMotion(time);
    },
  });
}
