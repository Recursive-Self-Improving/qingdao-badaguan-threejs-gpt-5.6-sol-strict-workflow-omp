import { describe, expect, it } from 'vitest';
import { computeViewport } from '../../src/platform/viewport';
import { QUALITY_ORDER, QUALITY_PROFILES, higherTier, lowerTier, selectInitialAutoTier } from '../../src/quality/qualityTiers';

const capable = { acceleration: 'hardware' as const, deviceMemoryGiB: 8, primaryPointerCoarse: false, anyPointerFine: true, hoverCapable: true, maxTextureSize: 8192, maxAnisotropy: 8, cssWidth: 1280, cssHeight: 720, devicePixelRatio: 1 };

describe('C11 quality profiles', () => {
  it('publishes exact deeply immutable tier contracts', () => {
    expect(QUALITY_ORDER).toEqual(['low', 'medium', 'high']);
    expect(QUALITY_PROFILES.low.viewport).toEqual({ renderScale: 0.75, maxDevicePixelRatio: 1.5, maxDrawingBufferPixels: 2_100_000 });
    expect(QUALITY_PROFILES.medium.viewport).toEqual({ renderScale: 0.9, maxDevicePixelRatio: 2, maxDrawingBufferPixels: 4_100_000 });
    expect(QUALITY_PROFILES.high.viewport).toEqual({ renderScale: 1, maxDevicePixelRatio: 3, maxDrawingBufferPixels: 8_300_000 });
    expect(QUALITY_PROFILES.low.shadows).toMatchObject({ mapSize: 1024, reachMeters: 90, radius: 1 });
    expect(QUALITY_PROFILES.medium.shadows).toMatchObject({ mapSize: 2048, reachMeters: 165, radius: 2 });
    expect(QUALITY_PROFILES.high.shadows).toMatchObject({ mapSize: 2048, reachMeters: 320, radius: 3 });
    expect(Object.values(QUALITY_PROFILES).every(({ postProcessing }) => postProcessing === false)).toBe(true);
    expect(Object.isFrozen(QUALITY_PROFILES.high.vegetation.bands)).toBe(true);
    expect(lowerTier('low')).toBe('low'); expect(lowerTier('high')).toBe('medium');
    expect(higherTier('low')).toBe('medium'); expect(higherTier('high')).toBe('high');
  });

  it('selects Auto conservatively without promoting missing facts', () => {
    expect(selectInitialAutoTier(capable)).toBe('high');
    expect(selectInitialAutoTier({ ...capable, deviceMemoryGiB: null })).toBe('medium');
    expect(selectInitialAutoTier({ ...capable, acceleration: 'software' })).toBe('low');
    expect(selectInitialAutoTier({ ...capable, primaryPointerCoarse: true, anyPointerFine: false })).toBe('low');
    expect(selectInitialAutoTier({ ...capable, deviceMemoryGiB: 4 })).toBe('low');
    expect(selectInitialAutoTier({ ...capable, maxTextureSize: 4096 })).toBe('low');
    expect(selectInitialAutoTier({ ...capable, maxAnisotropy: 2 })).toBe('low');
  });

  it('applies exact render scale, DPR ceiling, and floor pixel caps across the matrix', () => {
    for (const profile of Object.values(QUALITY_PROFILES)) for (const [width, height] of [[320, 568], [390, 844], [1280, 720], [1920, 1080]]) for (const dpr of [1, 2, 3]) {
      const value = computeViewport(width!, height!, dpr, profile.viewport)!;
      const requested = Math.min(dpr * profile.viewport.renderScale, profile.viewport.maxDevicePixelRatio);
      const effective = Math.min(requested, Math.sqrt(profile.viewport.maxDrawingBufferPixels / (width! * height!)));
      expect(value.requestedPixelRatio).toBe(requested);
      expect(value.pixelRatio).toBe(effective);
      expect(value.bufferWidth).toBe(Math.floor(width! * effective));
      expect(value.bufferHeight).toBe(Math.floor(height! * effective));
      expect(value.bufferPixels).toBeLessThanOrEqual(profile.viewport.maxDrawingBufferPixels);
    }
  });
});
