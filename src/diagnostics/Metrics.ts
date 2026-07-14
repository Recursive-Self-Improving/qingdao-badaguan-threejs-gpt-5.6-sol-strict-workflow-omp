import { InstancedMesh, Mesh, type BufferGeometry, type Object3D, type Texture, type WebGLRenderer } from 'three';

export const METRICS_RING_CAPACITY = 65_536;
export const APPROXIMATE_GPU_MEMORY_METHOD = 'Deduplicated geometry attribute/index byteLength plus texture width×height×bytes-per-texel×faces/layers, with 4/3 mip factor; excludes shader/program binaries, framebuffer/renderbuffer storage, driver alignment/caches, compression variance, and browser/driver overhead.';

export interface FramePercentiles {
  readonly sampleCount: number;
  readonly retainedSampleCount: number;
  readonly overwrittenSamples: number;
  readonly lastMs: number | null;
  readonly acceptedSampleCount: number;
  readonly measurementDurationMs: number;
  readonly medianMs: number | null;
  readonly p95Ms: number | null;
  readonly p99Ms: number | null;
  readonly method: 'nearest-rank';
}

export class Metrics {
  readonly #frames = new Float64Array(METRICS_RING_CAPACITY);
  #writeIndex = 0;
  #retained = 0;
  #total = 0;
  #lastTimestamp: number | null = null;
  #measurementStartMs: number | null = null;
  #lastAcceptedTimestampMs: number | null = null;
  #invalidReasons: string[] = [];

  recordFrame(timestampMs: number): void {
    if (!Number.isFinite(timestampMs)) { this.invalidate('invalid-timestamp'); this.#lastTimestamp = null; return; }
    if (this.#lastTimestamp === null) { this.#lastTimestamp = timestampMs; return; }
    const interval = timestampMs - this.#lastTimestamp;
    this.#lastTimestamp = timestampMs;
    if (!(interval > 0) || interval > 1_000) { this.invalidate('sample-gap'); return; }
    this.#frames[this.#writeIndex] = interval;
    this.#writeIndex = (this.#writeIndex + 1) % METRICS_RING_CAPACITY;
    this.#retained = Math.min(METRICS_RING_CAPACITY, this.#retained + 1);
    this.#lastAcceptedTimestampMs = timestampMs;
    this.#total += 1;
  }
  reset(timestampMs?: number): void {
    this.#writeIndex = 0; this.#retained = 0; this.#total = 0;
    this.#lastTimestamp = timestampMs ?? null; this.#measurementStartMs = timestampMs ?? null;
    this.#lastAcceptedTimestampMs = null; this.#invalidReasons = [];
  }
  invalidate(reason: string): void { if (!this.#invalidReasons.includes(reason)) this.#invalidReasons.push(reason); }
  get validity(): { readonly valid: boolean; readonly reasons: readonly string[] } {
    return Object.freeze({ valid: this.#invalidReasons.length === 0, reasons: Object.freeze([...this.#invalidReasons]) });
  }
  snapshotFrames(): FramePercentiles {
    if (this.#retained === 0) return Object.freeze({ sampleCount: this.#total, acceptedSampleCount: this.#total, retainedSampleCount: 0, overwrittenSamples: Math.max(0, this.#total), measurementDurationMs: 0, lastMs: null, medianMs: null, p95Ms: null, p99Ms: null, method: 'nearest-rank' });
    const sorted = new Float64Array(this.#retained);
    const start = this.#retained === METRICS_RING_CAPACITY ? this.#writeIndex : 0;
    for (let index = 0; index < this.#retained; index += 1) sorted[index] = this.#frames[(start + index) % METRICS_RING_CAPACITY]!;
    sorted.sort();
    const rank = (percentile: number): number => sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)]!;
    const lastIndex = (this.#writeIndex - 1 + METRICS_RING_CAPACITY) % METRICS_RING_CAPACITY;
    return Object.freeze({
      sampleCount: this.#total, acceptedSampleCount: this.#total, retainedSampleCount: this.#retained, overwrittenSamples: Math.max(0, this.#total - this.#retained),
      measurementDurationMs: this.#measurementStartMs === null || this.#lastAcceptedTimestampMs === null ? 0 : Math.max(0, this.#lastAcceptedTimestampMs - this.#measurementStartMs),
      lastMs: this.#frames[lastIndex]!, medianMs: rank(0.5), p95Ms: rank(0.95), p99Ms: rank(0.99), method: 'nearest-rank',
    });
  }
}

function textureBytes(texture: Texture): number {
  const image = texture.image as { width?: number; height?: number; depth?: number } | undefined;
  const width = Number(image?.width ?? 0); const height = Number(image?.height ?? 0); const layers = Math.max(1, Number(image?.depth ?? 1));
  if (!(width > 0 && height > 0)) return 0;
  const faces = Array.isArray(texture.image) ? texture.image.length : 1;
  return Math.round(width * height * 4 * layers * faces * (texture.generateMipmaps ? 4 / 3 : 1));
}

export function approximateGpuBytes(root: Object3D): number {
  const geometries = new Map<string, BufferGeometry>();
  const textures = new Map<string, Texture>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.set(object.geometry.uuid, object.geometry);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      for (const value of Object.values(material)) if (value && typeof value === 'object' && (value as Texture).isTexture) textures.set((value as Texture).uuid, value as Texture);
    }
  });
  let bytes = 0;
  for (const geometry of geometries.values()) {
    for (const attribute of Object.values(geometry.attributes)) bytes += attribute.array.byteLength;
    if (geometry.index !== null) bytes += geometry.index.array.byteLength;
  }
  for (const texture of textures.values()) bytes += textureBytes(texture);
  return bytes;
}

export function rendererMetrics(renderer: WebGLRenderer, root: Object3D): Readonly<Record<string, number | string>> {
  let meshes = 0; let instancedMeshes = 0; let instancedTransforms = 0;
  root.traverse((object) => {
    if (object instanceof InstancedMesh) { instancedMeshes += 1; instancedTransforms += object.count; }
    else if (object instanceof Mesh) meshes += 1;
  });
  return Object.freeze({
    calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length ?? 0, meshes, instancedMeshes, instancedTransforms,
    approximateGpuBytes: approximateGpuBytes(root), approximateGpuMemoryMethod: APPROXIMATE_GPU_MEMORY_METHOD,
  });
}
