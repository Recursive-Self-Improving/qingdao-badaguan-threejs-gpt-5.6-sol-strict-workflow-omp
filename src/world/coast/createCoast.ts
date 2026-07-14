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
  Uint32BufferAttribute,
  ShaderMaterial,
  Vector3,
} from 'three';

import { sampleGroundHeight } from '../../exploration/navigation';
import type { ResourceRegistry } from '../../render/ResourceRegistry';
import { DISTRICT_DATA } from '../districtData';
import { qualityProfile } from '../../quality/qualityTiers';
import type {
  AtmosphereConfig,
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
const BEACH_DEPTH = 5.2;
const HASH_OFFSET = 0x811c9dc5;
const SHORELINE_SEGMENTS = 128;
const SHORELINE_PRIMARY_AMPLITUDE = 2.6;
const SHORELINE_SECONDARY_AMPLITUDE = 1;
const WATER_HORIZON_WIDTH = 900;

const BEACH_VERTEX_SHADER = `
varying float vBeachProgress;
varying float vBeachX;
void main() {
  vBeachProgress = uv.y;
  vBeachX = position.x;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const BEACH_FRAGMENT_SHADER = `
uniform vec3 drySandColor;
uniform vec3 wetSandColor;
varying float vBeachProgress;
varying float vBeachX;
void main() {
  float wetStart = 0.28 + 0.07 * sin(vBeachX * 0.021) + 0.035 * sin(vBeachX * 0.057 + 0.8);
  float wetMix = smoothstep(wetStart, 1.0, vBeachProgress);
  gl_FragColor = vec4(mix(drySandColor, wetSandColor, wetMix), 1.0);
}
`;
const WATER_VERTEX_SHADER = `
uniform float waterDepth;
varying float vShoreDistance;
varying float vViewDepth;
varying float vWaterX;
void main() {
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vShoreDistance = (1.0 - uv.y) * waterDepth;
  vViewDepth = -viewPosition.z;
  vWaterX = position.x;
  gl_Position = projectionMatrix * viewPosition;
}
`;
const WATER_FRAGMENT_SHADER = `
uniform vec3 horizonColor;
uniform vec3 waterColor;
uniform vec3 shallowWaterColor;
uniform vec3 midWaterColor;
uniform vec3 wetSandColor;
uniform vec3 foamColor;
uniform float horizonFadeStart;
uniform float horizonFadeEnd;
uniform float shoreBlendDistance;
uniform float shoreFoamStart;
uniform float shoreFoamEnd;
uniform float staticDetailStrength;
varying float vShoreDistance;
varying float vViewDepth;
varying float vWaterX;
void main() {
  float shoreWidth = shoreBlendDistance * (
    1.0 + 0.12 * sin(vWaterX * 0.031) + 0.05 * sin(vWaterX * 0.083 + 1.2)
  );
  float shoreProgress = smoothstep(
    0.0,
    1.0,
    clamp(vShoreDistance / shoreWidth, 0.0, 1.0)
  );
  float inverseShore = 1.0 - shoreProgress;
  vec3 shoreColor = inverseShore * inverseShore * wetSandColor
    + 2.0 * inverseShore * shoreProgress * shallowWaterColor
    + shoreProgress * shoreProgress * waterColor;

  float logStart = log(1.0 + horizonFadeStart);
  float logRange = log(1.0 + horizonFadeEnd) - logStart;
  float logDepth = log(1.0 + max(vViewDepth, 0.0));
  float depthProgress = smoothstep(
    0.0,
    1.0,
    clamp((logDepth - logStart) / logRange, 0.0, 1.0)
  );
  float inverseDepth = 1.0 - depthProgress;
  vec3 viewDepthColor = inverseDepth * inverseDepth * waterColor
    + 2.0 * inverseDepth * depthProgress * midWaterColor
    + depthProgress * depthProgress * horizonColor;
  vec3 depthColor = mix(shoreColor, viewDepthColor, shoreProgress);

  float staticRipple = sin(vWaterX * 0.091 + vShoreDistance * 0.061)
    * sin(vWaterX * 0.037 - vShoreDistance * 0.109 + 1.1);
  float staticTonalDetail = staticRipple * staticDetailStrength * 0.04
    * shoreProgress * (1.0 - depthProgress);
  depthColor += vec3(staticTonalDetail);

  float foamOffset = 0.14 * sin(vWaterX * 0.047) + 0.06 * sin(vWaterX * 0.113 + 0.9);
  float foamStart = shoreFoamStart + foamOffset;
  float foamEnd = shoreFoamEnd + foamOffset;
  float foamIn = smoothstep(foamStart, foamStart + 0.08, vShoreDistance);
  float foamOut = 1.0 - smoothstep(foamEnd - 0.08, foamEnd, vShoreDistance);
  float foamPattern = 0.78 + 0.22 * (0.5 + 0.5
    * sin(vWaterX * 0.19 + vShoreDistance * 0.7)
    * sin(vWaterX * 0.043 - vShoreDistance * 0.31));
  depthColor = mix(depthColor, foamColor, foamIn * foamOut * foamPattern * 0.36);
  gl_FragColor = vec4(depthColor, 1.0);
}
`;

function createIndexedSurfaceGeometry(
  positions: Float32Array,
  indices: readonly number[],
  uvs: Float32Array | null = null,
): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const normals = new Float32Array(positions.length);
  for (let index = 1; index < normals.length; index += 3) normals[index] = 1;
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  if (uvs !== null) geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(new Uint32BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createShoreline(minX: number, maxX: number, baseZ: number): Float32Array {
  const columns = SHORELINE_SEGMENTS + 1;
  const shoreline = new Float32Array(columns * 2);
  for (let column = 0; column < columns; column += 1) {
    const t = column / SHORELINE_SEGMENTS;
    const x = minX + (maxX - minX) * t;
    const offset = SHORELINE_PRIMARY_AMPLITUDE * Math.sin(x * 0.009)
      + SHORELINE_SECONDARY_AMPLITUDE * Math.sin(x * 0.022 + 0.65);
    shoreline[column * 2] = x;
    shoreline[column * 2 + 1] = baseZ + offset;
  }
  return shoreline;
}

function createBeachGeometry(shoreline: Float32Array, landZ: number): BufferGeometry {
  const columns = SHORELINE_SEGMENTS + 1;
  const positions = new Float32Array(columns * 2 * 3);
  const uvs = new Float32Array(columns * 2 * 2);
  const indices: number[] = [];
  for (let column = 0; column < columns; column += 1) {
    const x = shoreline[column * 2] ?? 0;
    const shoreZ = shoreline[column * 2 + 1] ?? landZ;
    const landVertex = column;
    const shoreVertex = columns + column;
    const landOffset = landVertex * 3;
    const shoreOffset = shoreVertex * 3;
    const acrossT = column / SHORELINE_SEGMENTS;
    positions[landOffset] = x;
    positions[landOffset + 2] = landZ;
    positions[shoreOffset] = x;
    positions[shoreOffset + 2] = shoreZ;
    uvs[landVertex * 2] = acrossT;
    uvs[landVertex * 2 + 1] = 0;
    uvs[shoreVertex * 2] = acrossT;
    uvs[shoreVertex * 2 + 1] = 1;
  }
  for (let segment = 0; segment < SHORELINE_SEGMENTS; segment += 1) {
    const landLeft = segment;
    const landRight = segment + 1;
    const shoreLeft = columns + segment;
    const shoreRight = shoreLeft + 1;
    indices.push(landLeft, shoreLeft, landRight, landRight, shoreLeft, shoreRight);
  }
  const geometry = createIndexedSurfaceGeometry(positions, indices, uvs);
  geometry.userData.shorelineVertexStart = columns;
  geometry.userData.shorelineVertexCount = columns;
  geometry.userData.shorelineSegments = SHORELINE_SEGMENTS;
  return geometry;
}

function createWaterGeometry(
  shoreline: Float32Array,
  waterEndZ: number,
  depthSegments: 1 | 4 | 8,
): BufferGeometry {
  const columns = SHORELINE_SEGMENTS + 1;
  const rows = depthSegments + 1;
  const positions = new Float32Array(columns * rows * 3);
  const uvs = new Float32Array(columns * rows * 2);
  const indices: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    const depthT = row / depthSegments;
    for (let column = 0; column < columns; column += 1) {
      const acrossT = column / SHORELINE_SEGMENTS;
      const shoreX = shoreline[column * 2] ?? 0;
      const shoreZ = shoreline[column * 2 + 1] ?? waterEndZ;
      const horizonX = -WATER_HORIZON_WIDTH * 0.5 + WATER_HORIZON_WIDTH * acrossT;
      const vertex = row * columns + column;
      const positionOffset = vertex * 3;
      const uvOffset = vertex * 2;
      positions[positionOffset] = shoreX + (horizonX - shoreX) * depthT;
      positions[positionOffset + 2] = shoreZ + (waterEndZ - shoreZ) * depthT;
      uvs[uvOffset] = acrossT;
      uvs[uvOffset + 1] = 1 - depthT;
    }
  }
  for (let row = 0; row < depthSegments; row += 1) {
    for (let segment = 0; segment < SHORELINE_SEGMENTS; segment += 1) {
      const nearLeft = row * columns + segment;
      const nearRight = nearLeft + 1;
      const farLeft = nearLeft + columns;
      const farRight = farLeft + 1;
      indices.push(nearLeft, farLeft, nearRight, nearRight, farLeft, farRight);
    }
  }
  const geometry = createIndexedSurfaceGeometry(positions, indices, uvs);
  geometry.userData.shorelineVertexStart = 0;
  geometry.userData.shorelineVertexCount = columns;
  geometry.userData.shorelineSegments = SHORELINE_SEGMENTS;
  geometry.userData.depthSegments = depthSegments;
  return geometry;
}

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
  config: AtmosphereConfig,
): CoastController {
  const root = new Group();
  root.name = 'coast';
  root.userData.collidable = false;
  root.userData.horizonLayer = 'fogged-water-extension';
  const profile = qualityProfile(settings.density);
  const coast = config.coast;
  if (!(coast.horizonFadeStart > 0 && coast.horizonFadeEnd > coast.horizonFadeStart)) {
    throw new RangeError('Coast horizon fade must have a positive, ordered view-depth range.');
  }
  if (!(coast.shoreBlendDistance > 0)) {
    throw new RangeError('Coast shore blend distance must be positive.');
  }
  if (!(coast.shoreFoamStart >= 0 && coast.shoreFoamEnd > coast.shoreFoamStart
    && coast.shoreFoamEnd < coast.shoreBlendDistance)) {
    throw new RangeError('Coast foam range must be ordered inside the shore blend distance.');
  }
  if (!(coast.staticDetailStrength >= 0 && coast.staticDetailStrength <= 0.25)) {
    throw new RangeError('Coast static detail strength must be between zero and 0.25.');
  }

  const promenadeGeometry = resources.register(createPromenadeGeometry(data), group);
  const promenadeMaterial = resources.register(new MeshStandardMaterial({ color: new Color(0xb6aa93), roughness: 0.94, metalness: 0 }), group);
  const promenade = new Mesh(promenadeGeometry, promenadeMaterial);
  promenade.name = 'coast:promenade';
  promenade.receiveShadow = true;
  root.add(promenade);

  const sea = data.coast.seaBounds;
  const baseY = sampleGroundHeight(0, data.coast.edgeZ) + WATER_LEVEL_OFFSET;
  const waterStartZ = sea.minZ + BEACH_DEPTH;
  const waterEndZ = sea.maxZ + 800;
  const waterDepth = waterEndZ - waterStartZ;
  const shoreline = createShoreline(sea.minX, sea.maxX, waterStartZ);
  const beachGeometry = resources.register(createBeachGeometry(shoreline, sea.minZ), group);
  const channel = (color: number, shift: number): number => (color >> shift) & 0xff;
  const beachMaterial = resources.register(new ShaderMaterial({
    toneMapped: false,
    uniforms: {
      drySandColor: { value: new Vector3(channel(coast.beachColor, 16) / 255, channel(coast.beachColor, 8) / 255, channel(coast.beachColor, 0) / 255) },
      wetSandColor: { value: new Vector3(channel(coast.wetSandColor, 16) / 255, channel(coast.wetSandColor, 8) / 255, channel(coast.wetSandColor, 0) / 255) },
    },
    vertexShader: BEACH_VERTEX_SHADER,
    fragmentShader: BEACH_FRAGMENT_SHADER,
  }), group);
  const beach = new Mesh(beachGeometry, beachMaterial);
  beach.name = 'coast:restrained-beach';
  beach.position.y = baseY;
  root.add(beach);
  const waterGeometry = resources.register(createWaterGeometry(shoreline, waterEndZ, profile.water.segments), group);
  const waterMaterial = resources.register(new ShaderMaterial({
    toneMapped: false,
    uniforms: {
      waterColor: { value: new Vector3(channel(coast.waterColor, 16) / 255, channel(coast.waterColor, 8) / 255, channel(coast.waterColor, 0) / 255) },
      shallowWaterColor: { value: new Vector3(channel(coast.shallowWaterColor, 16) / 255, channel(coast.shallowWaterColor, 8) / 255, channel(coast.shallowWaterColor, 0) / 255) },
      midWaterColor: { value: new Vector3(channel(coast.midWaterColor, 16) / 255, channel(coast.midWaterColor, 8) / 255, channel(coast.midWaterColor, 0) / 255) },
      wetSandColor: { value: new Vector3(channel(coast.wetSandColor, 16) / 255, channel(coast.wetSandColor, 8) / 255, channel(coast.wetSandColor, 0) / 255) },
      foamColor: { value: new Vector3(channel(coast.foamColor, 16) / 255, channel(coast.foamColor, 8) / 255, channel(coast.foamColor, 0) / 255) },
      horizonColor: { value: new Vector3(channel(coast.horizonColor, 16) / 255, channel(coast.horizonColor, 8) / 255, channel(coast.horizonColor, 0) / 255) },
      horizonFadeStart: { value: coast.horizonFadeStart },
      horizonFadeEnd: { value: coast.horizonFadeEnd },
      shoreBlendDistance: { value: coast.shoreBlendDistance },
      shoreFoamStart: { value: coast.shoreFoamStart },
      shoreFoamEnd: { value: coast.shoreFoamEnd },
      waterDepth: { value: waterDepth },
      staticDetailStrength: { value: coast.staticDetailStrength },
    },
    vertexShader: WATER_VERTEX_SHADER,
    fragmentShader: WATER_FRAGMENT_SHADER,
  }), group);
  const water = new Mesh(waterGeometry, waterMaterial);
  water.name = 'coast:water';
  water.position.y = baseY;
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

  const amplitude = settings.motion === 'reduced' ? 0 : profile.water.motionAmplitude;
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
        waterStaticDetailStrength: coast.staticDetailStrength,
        waterSegments: profile.water.segments,
        horizonFadeStart: coast.horizonFadeStart,
        horizonFadeEnd: coast.horizonFadeEnd,
        shoreBlendDistance: coast.shoreBlendDistance,
        shoreFoamStart: coast.shoreFoamStart,
        shoreFoamEnd: coast.shoreFoamEnd,
        beachLayers: 1,
        horizonLayers: 1,
        openingCount: data.coast.screen.openings.length,
        clearanceIntersections: 0,
        collidable: false,
      });
    },
    update(frame: LandscapeUpdateFrame): void {
      if (!Number.isFinite(frame.elapsedSeconds) || frame.elapsedSeconds < 0) return;
      if (amplitude === 0 && captureTime === null) return;
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
