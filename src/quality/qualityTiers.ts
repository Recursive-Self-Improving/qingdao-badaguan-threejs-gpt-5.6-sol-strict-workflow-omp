import type { LandscapeSettings, VegetationLodPolicy } from '../world/types';

export type QualityTier = 'low' | 'medium' | 'high';
export type QualityPreference = 'auto' | QualityTier;
export type MotionPreference = 'system' | 'reduced';

export interface QualityCapabilityFacts {
  readonly acceleration: 'hardware' | 'software' | 'unknown';
  readonly deviceMemoryGiB: number | null;
  readonly primaryPointerCoarse: boolean;
  readonly anyPointerFine: boolean;
  readonly hoverCapable: boolean;
  readonly maxTextureSize: number | null;
  readonly maxAnisotropy: number | null;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
}

export interface QualityProfile {
  readonly tier: QualityTier;
  readonly viewport: {
    readonly renderScale: number;
    readonly maxDevicePixelRatio: number;
    readonly maxDrawingBufferPixels: number;
  };
  readonly shadows: {
    readonly mapSize: 1024 | 2048;
    readonly reachMeters: number;
    readonly cameraExtent: number;
    readonly radius: 1 | 2 | 3;
    readonly blurSamples: 4 | 8;
    readonly vegetationCast: boolean;
  };
  readonly vegetation: VegetationLodPolicy;
  readonly textureMaxDimension: 1024 | 2048;
  readonly anisotropy: 2 | 4 | 8;
  readonly animation: { readonly updateHz: 0 | 30 | 60; readonly windAmplitude: number };
  readonly water: { readonly segments: 1 | 4 | 8; readonly motionAmplitude: number };
  readonly environment: {
    readonly fogNearMultiplier: number;
    readonly fogFarMultiplier: number;
    readonly ambientMultiplier: number;
    readonly exposure: number;
    readonly shadowBias: number;
    readonly shadowNormalBias: number;
  };
  readonly postProcessing: false;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const QUALITY_ORDER = Object.freeze(['low', 'medium', 'high'] as const);

export const QUALITY_PROFILES: Readonly<Record<QualityTier, QualityProfile>> = deepFreeze({
  low: {
    tier: 'low', viewport: { renderScale: 0.75, maxDevicePixelRatio: 1.5, maxDrawingBufferPixels: 2_100_000 },
    shadows: { mapSize: 1024, reachMeters: 90, cameraExtent: 90, radius: 1, blurSamples: 4, vegetationCast: false },
    vegetation: { density: 'low', identityInstancesPerRoad: 1, infillFraction: 0, accentFraction: 0, bands: [{ id: 'near', maximumDistance: 50, canopySegments: 7 }, { id: 'mid', maximumDistance: 115, canopySegments: 5 }, { id: 'far', maximumDistance: 240, canopySegments: 4 }] },
    textureMaxDimension: 1024, anisotropy: 2, animation: { updateHz: 0, windAmplitude: 0 }, water: { segments: 1, motionAmplitude: 0 },
    environment: { fogNearMultiplier: 1.35, fogFarMultiplier: 1.15, ambientMultiplier: 0.9, exposure: 1.08, shadowBias: 0, shadowNormalBias: 0.006 }, postProcessing: false,
  },
  medium: {
    tier: 'medium', viewport: { renderScale: 0.9, maxDevicePixelRatio: 2, maxDrawingBufferPixels: 4_100_000 },
    shadows: { mapSize: 2048, reachMeters: 165, cameraExtent: 165, radius: 2, blurSamples: 8, vegetationCast: true },
    vegetation: { density: 'medium', identityInstancesPerRoad: 1, infillFraction: 0.62, accentFraction: 0.5, bands: [{ id: 'near', maximumDistance: 60, canopySegments: 9 }, { id: 'mid', maximumDistance: 135, canopySegments: 6 }, { id: 'far', maximumDistance: 280, canopySegments: 5 }] },
    textureMaxDimension: 2048, anisotropy: 4, animation: { updateHz: 30, windAmplitude: 0.012 }, water: { segments: 4, motionAmplitude: 0.012 },
    environment: { fogNearMultiplier: 1.125, fogFarMultiplier: 1.05, ambientMultiplier: 0.86, exposure: 1.05, shadowBias: 0, shadowNormalBias: 0.005 }, postProcessing: false,
  },
  high: {
    tier: 'high', viewport: { renderScale: 1, maxDevicePixelRatio: 3, maxDrawingBufferPixels: 8_300_000 },
    shadows: { mapSize: 2048, reachMeters: 320, cameraExtent: 210, radius: 3, blurSamples: 8, vegetationCast: true },
    vegetation: { density: 'high', identityInstancesPerRoad: 1, infillFraction: 1, accentFraction: 1, bands: [{ id: 'near', maximumDistance: 70, canopySegments: 10 }, { id: 'mid', maximumDistance: 150, canopySegments: 7 }, { id: 'far', maximumDistance: 320, canopySegments: 5 }] },
    textureMaxDimension: 2048, anisotropy: 8, animation: { updateHz: 60, windAmplitude: 0.016 }, water: { segments: 8, motionAmplitude: 0.018 },
    environment: { fogNearMultiplier: 1, fogFarMultiplier: 1, ambientMultiplier: 0.82, exposure: 1.04, shadowBias: 0, shadowNormalBias: 0.004 }, postProcessing: false,
  },
});

export function qualityProfile(tier: QualityTier): QualityProfile { return QUALITY_PROFILES[tier]; }
export function lowerTier(tier: QualityTier): QualityTier { return QUALITY_ORDER[Math.max(0, QUALITY_ORDER.indexOf(tier) - 1)]!; }
export function higherTier(tier: QualityTier): QualityTier { return QUALITY_ORDER[Math.min(QUALITY_ORDER.length - 1, QUALITY_ORDER.indexOf(tier) + 1)]!; }
export function toLandscapeSettings(profile: QualityProfile, reduced: boolean): LandscapeSettings {
  return Object.freeze({ density: profile.tier, motion: reduced ? 'reduced' : 'standard' });
}

export function initialDemandPixels(facts: QualityCapabilityFacts): number {
  const dpr = Number.isFinite(facts.devicePixelRatio) && facts.devicePixelRatio > 0 ? Math.min(facts.devicePixelRatio, 3) : 1;
  return Math.max(0, facts.cssWidth) * Math.max(0, facts.cssHeight) * dpr * dpr;
}

export function selectInitialAutoTier(facts: QualityCapabilityFacts): QualityTier {
  const demand = initialDemandPixels(facts);
  const coarseOnly = facts.primaryPointerCoarse && !facts.anyPointerFine;
  if (facts.acceleration === 'software' || coarseOnly || (facts.deviceMemoryGiB !== null && facts.deviceMemoryGiB <= 4)
    || (facts.maxTextureSize !== null && facts.maxTextureSize < 8192)
    || (facts.maxAnisotropy !== null && facts.maxAnisotropy < 4) || demand > 8_300_000) return 'low';
  const high = facts.acceleration === 'hardware' && facts.deviceMemoryGiB !== null && facts.deviceMemoryGiB >= 8
    && facts.anyPointerFine && facts.hoverCapable && facts.maxTextureSize !== null && facts.maxTextureSize >= 8192
    && facts.maxAnisotropy !== null && facts.maxAnisotropy >= 8 && demand <= 8_300_000;
  return high ? 'high' : 'medium';
}
