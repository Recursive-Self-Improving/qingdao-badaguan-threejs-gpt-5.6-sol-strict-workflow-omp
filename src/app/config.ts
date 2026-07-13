import type { AtmosphereConfig } from '../world/types';

export const APP_COPY = {
  boot: 'Preparing the Badaguan experience…',
  loading: 'Checking whether this browser can run the Badaguan 3D experience…',
  onboarding:
    'Explore Badaguan in Qingdao. Move with WASD or the arrow keys, look with the mouse or drag/touch, and press Escape to pause or release the mouse.',
  exploringLocked: 'Press Escape to release',
  exploringDrag:
    'Mouse lock is unavailable. Drag and use the keyboard, or use touch, to explore Badaguan.',
  paused: 'Exploration paused. Resume when you are ready.',
  degraded:
    'The Badaguan experience is running in a reduced mode. Retry to check capabilities again.',
  contextLost:
    'The graphics context was lost. A restart is required before the interactive walk can continue. Retry to check capabilities and restart the experience.',
  unsupported:
    'This browser cannot run the Badaguan 3D experience. You can retry after changing browser or device settings.',
  fatal: 'The Badaguan experience could not continue. Retry to start again.',
} as const;

export const APP_CONFIG = {
  placeName: 'Badaguan',
  lockedInstruction: APP_COPY.exploringLocked,
  fallbackInstruction: APP_COPY.exploringDrag,
  camera: {
    fov: 65,
    near: 0.15,
    far: 550,
    eyeHeight: 1.68,
    neutralZ: 5,
    worldUp: [0, 1, 0] as const,
    roll: 0,
  },
} as const;

export const ATMOSPHERE_CONFIG: AtmosphereConfig = Object.freeze({
  sky: Object.freeze({ zenith: 0x7895a8, horizon: 0x7c867f, ground: 0x84908a }),
  fog: Object.freeze({ color: 0xb9c0bb, near: 80, far: 380 }),
  hemisphere: Object.freeze({ skyColor: 0xb8cccf, groundColor: 0x6f6858, intensity: 1.42 }),
  sun: Object.freeze({
    color: 0xffddb0,
    intensity: 2.95,
    position: Object.freeze([-185, 145, -95] as const),
    target: Object.freeze([15, 0, -120] as const),
  }),
  quality: Object.freeze({
    high: Object.freeze({ shadowMapSize: 2048, shadowCameraExtent: 165, shadowBias: 0, shadowNormalBias: 0.004, fogNearMultiplier: 1, fogFarMultiplier: 1, ambientMultiplier: 0.82, exposure: 1.04, waterSegments: 8 }),
    medium: Object.freeze({ shadowMapSize: 1024, shadowCameraExtent: 160, shadowBias: 0, shadowNormalBias: 0.005, fogNearMultiplier: 1.125, fogFarMultiplier: 1.05, ambientMultiplier: 0.86, exposure: 1.05, waterSegments: 4 }),
    low: Object.freeze({ shadowMapSize: 512, shadowCameraExtent: 155, shadowBias: 0, shadowNormalBias: 0.006, fogNearMultiplier: 1.35, fogFarMultiplier: 1.15, ambientMultiplier: 0.9, exposure: 1.08, waterSegments: 1 }),
  }),
  cameraViews: Object.freeze([
    Object.freeze({ id: 'spawn', position: Object.freeze([0, 4.35, 5] as const), target: Object.freeze([0, 4.1, -42] as const) }),
    Object.freeze({ id: 'deep-shade', position: Object.freeze([-140, 5.05, -177.5] as const), target: Object.freeze([-70, 4.9, -177.5] as const) }),
    Object.freeze({ id: 'uphill-vista', position: Object.freeze([0, 3.2, -80] as const), target: Object.freeze([0, 8.4, -245] as const) }),
    Object.freeze({ id: 'landmark', position: Object.freeze([0, 4.35, 35] as const), target: Object.freeze([36, 6.4, 25.5] as const) }),
    Object.freeze({ id: 'shore', position: Object.freeze([-120, 6.5, 37] as const), target: Object.freeze([-45, 0.8, 55] as const) }),
  ]),
  coast: Object.freeze({
    waterColor: 0x3f7188,
    shallowWaterColor: 0x9a9b82,
    midWaterColor: 0x678a97,
    beachColor: 0xb8a98d,
    wetSandColor: 0xb39c72,
    foamColor: 0xd4c9a8,
    shoreBlendDistance: 12,
    shoreFoamStart: 0.72,
    shoreFoamEnd: 1.12,
    horizonColor: 0x7c867f,
    horizonFadeStart: 4.5,
    horizonFadeEnd: 220,
    staticDetailStrength: 0.16,
    standardMotionAmplitude: 0.018,
    reducedMotionAmplitude: 0,
  }),
});
