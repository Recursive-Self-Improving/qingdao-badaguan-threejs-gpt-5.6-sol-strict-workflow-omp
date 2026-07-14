import { BufferAttribute, BufferGeometry, DataTexture, Mesh, MeshBasicMaterial, Object3D, RGBAFormat, UnsignedByteType } from 'three';
import { describe, expect, it } from 'vitest';
import { approximateGpuBytes, METRICS_RING_CAPACITY, Metrics } from '../../src/diagnostics/Metrics';

describe('C11 DEV metrics', () => {
  it('uses a fixed ring and nearest-rank explicit percentiles', () => {
    const metrics = new Metrics();
    metrics.recordFrame(0);
    for (let index = 1; index <= METRICS_RING_CAPACITY + 5; index += 1) metrics.recordFrame(index * 10);
    const snapshot = metrics.snapshotFrames();
    expect(snapshot).toMatchObject({ sampleCount: METRICS_RING_CAPACITY + 5, retainedSampleCount: METRICS_RING_CAPACITY, overwrittenSamples: 5, medianMs: 10, p95Ms: 10, p99Ms: 10, method: 'nearest-rank' });
  });

  it('rejects invalid intervals without inventing samples', () => {
    const metrics = new Metrics(); metrics.recordFrame(10); metrics.recordFrame(Number.NaN); metrics.recordFrame(20); metrics.recordFrame(2021);
    expect(metrics.snapshotFrames().sampleCount).toBe(0);
    expect(metrics.validity).toEqual({ valid: false, reasons: ['invalid-timestamp', 'sample-gap'] });
  });

  it('deduplicates shared geometry and texture byte estimates', () => {
    const root = new Object3D();
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new BufferAttribute(new Float32Array(9), 3)); geometry.setIndex([0, 1, 2]);
    const texture = new DataTexture(new Uint8Array(4 * 4 * 4), 4, 4, RGBAFormat, UnsignedByteType); texture.generateMipmaps = false;
    const material = new MeshBasicMaterial({ map: texture }); root.add(new Mesh(geometry, material), new Mesh(geometry, material));
    expect(approximateGpuBytes(root)).toBe(9 * 4 + 3 * 2 + 4 * 4 * 4);
  });
});
