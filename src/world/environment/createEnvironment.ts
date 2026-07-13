import {
  DataTexture,
  DirectionalLight,
  Group,
  HemisphereLight,
  LinearFilter,
  SRGBColorSpace,
  RGBAFormat,
  UnsignedByteType,
} from 'three';

import type { ResourceRegistry } from '../../render/ResourceRegistry';
import type {
  AtmosphereConfig,
  EnvironmentController,
  EnvironmentMetrics,
  LandscapeSettings,
  LandscapeUpdateFrame,
} from '../types';

const SKY_GRADIENT_ROWS = 256;

function validateConfig(config: AtmosphereConfig): void {
  if (!(config.fog.near > 0 && config.fog.far > config.fog.near)) {
    throw new RangeError('Environment fog must have a positive, ordered depth range.');
  }
  for (const quality of Object.values(config.quality)) {
    const fogNear = config.fog.near * quality.fogNearMultiplier;
    const fogFar = config.fog.far * quality.fogFarMultiplier;
    if (!(quality.ambientMultiplier > 0 && fogNear > 0 && fogFar > fogNear)) {
      throw new RangeError('Environment quality must define positive ambient fill and an ordered fog range.');
    }
  }
  if (config.cameraViews.length !== 5 || new Set(config.cameraViews.map(({ id }) => id)).size !== 5) {
    throw new RangeError('Environment must define five unique verification views.');
  }
}

/** Creates the immutable C07 early-autumn morning sky, fill light, and soft directional sun. */
export function createEnvironment(
  resources: ResourceRegistry,
  group: string,
  settings: LandscapeSettings,
  config: AtmosphereConfig,
): EnvironmentController {
  validateConfig(config);
  const quality = config.quality[settings.density];
  const fogNear = config.fog.near * quality.fogNearMultiplier;
  const fogFar = config.fog.far * quality.fogFarMultiplier;
  const ambientIntensity = config.hemisphere.intensity * quality.ambientMultiplier;
  const root = new Group();
  root.name = 'environment:early-autumn-morning';

  const skyPixels = new Uint8Array(SKY_GRADIENT_ROWS * 4);
  const channel = (color: number, shift: number): number => (color >> shift) & 0xff;
  for (let row = 0; row < SKY_GRADIENT_ROWS; row += 1) {
    const t = row / (SKY_GRADIENT_ROWS - 1);
    const fromColor = t < 0.25 ? config.sky.horizon : t < 0.5 ? config.sky.ground : config.sky.horizon;
    const toColor = t < 0.25 ? config.sky.ground : t < 0.5 ? config.sky.horizon : config.sky.zenith;
    const blend = t < 0.25 ? t * 4 : t < 0.5 ? (t - 0.25) * 4 : (t - 0.5) * 2;
    const offset = row * 4;
    skyPixels[offset] = Math.round(channel(fromColor, 16) * (1 - blend) + channel(toColor, 16) * blend);
    skyPixels[offset + 1] = Math.round(channel(fromColor, 8) * (1 - blend) + channel(toColor, 8) * blend);
    skyPixels[offset + 2] = Math.round(channel(fromColor, 0) * (1 - blend) + channel(toColor, 0) * blend);
    skyPixels[offset + 3] = 255;
  }
  const backgroundTexture = resources.register(new DataTexture(skyPixels, 1, SKY_GRADIENT_ROWS, RGBAFormat, UnsignedByteType), group);
  backgroundTexture.name = 'environment:sky-gradient';
  backgroundTexture.colorSpace = SRGBColorSpace;
  backgroundTexture.magFilter = LinearFilter;
  backgroundTexture.minFilter = LinearFilter;
  backgroundTexture.generateMipmaps = false;
  backgroundTexture.needsUpdate = true;
  const hemisphere = new HemisphereLight(
    config.hemisphere.skyColor,
    config.hemisphere.groundColor,
    ambientIntensity,
  );
  hemisphere.name = 'environment:hemisphere-fill';
  root.add(hemisphere);

  const sun = new DirectionalLight(config.sun.color, config.sun.intensity);
  sun.name = 'environment:morning-sun';
  sun.position.set(...config.sun.position);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  sun.shadow.camera.left = -quality.shadowCameraExtent;
  sun.shadow.camera.right = quality.shadowCameraExtent;
  sun.shadow.camera.top = quality.shadowCameraExtent;
  sun.shadow.camera.bottom = -quality.shadowCameraExtent;
  sun.shadow.camera.near = 15;
  sun.shadow.camera.far = 520;
  sun.shadow.bias = quality.shadowBias;
  sun.shadow.normalBias = quality.shadowNormalBias;
  sun.shadow.radius = settings.density === 'high' ? 3 : settings.density === 'medium' ? 2 : 1;
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  sun.shadow.blurSamples = 8;
  sun.target.position.set(...config.sun.target);
  root.add(sun, sun.target);

  const deltaX = config.sun.target[0] - config.sun.position[0];
  const deltaY = config.sun.target[1] - config.sun.position[1];
  const deltaZ = config.sun.target[2] - config.sun.position[2];
  const length = Math.hypot(deltaX, deltaY, deltaZ);
  const metrics: EnvironmentMetrics = Object.freeze({
    quality: settings.density,
    motion: settings.motion,
    sunDirection: Object.freeze([deltaX / length, deltaY / length, deltaZ / length] as const),
    fogNear,
    fogFar,
    exposure: quality.exposure,
    ambientIntensity,
    skyGradientRows: SKY_GRADIENT_ROWS,
    shadowMapSize: quality.shadowMapSize,
    shadowBias: quality.shadowBias,
    shadowNormalBias: quality.shadowNormalBias,
    contactGrounding: true,
  });

  return Object.freeze({
    root,
    config,
    backgroundTexture,
    metrics,
    cameraViews: config.cameraViews,
    backgroundColor: config.sky.horizon,
    fogColor: config.fog.color,
    fogNear,
    fogFar,
    update(_frame: LandscapeUpdateFrame): void {},
    reset(): void {},
    setCaptureTime(time: number | null): void {
      if (time !== null && (!Number.isFinite(time) || time < 0)) {
        throw new RangeError('Environment capture time must be a finite non-negative number or null.');
      }
    },
  });
}
