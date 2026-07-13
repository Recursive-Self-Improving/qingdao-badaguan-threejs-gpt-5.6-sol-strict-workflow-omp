import { Group } from 'three';

import type { ResourceRegistry } from '../../render/ResourceRegistry';
import { DISTRICT_DATA } from '../districtData';
import type {
  Bounds2,
  DistrictData,
  LandscapeBuildMetrics,
  LandscapeBuildResult,
  LandscapeCameraView,
  LandscapeClearanceBound,
  LandscapeDensity,
  LandscapeDensityMetrics,
  LandscapeSettings,
  LandscapeUpdateFrame,
} from '../types';
import { createDetailMetrics, createDetails, type DetailBuildMetrics } from './createDetails';
import {
  createVegetation,
  createVegetationLayout,
  type VegetationBuildResult,
} from './createVegetation';

const DENSITIES = ['high', 'medium', 'low'] as const satisfies readonly LandscapeDensity[];

function boundsIntersect(first: Bounds2, second: Bounds2): boolean {
  return first.minX < second.maxX
    && first.maxX > second.minX
    && first.minZ < second.maxZ
    && first.maxZ > second.minZ;
}

function mergeDensityMetrics(
  vegetation: LandscapeDensityMetrics,
  details: DetailBuildMetrics,
): LandscapeDensityMetrics {
  return Object.freeze({
    vegetationInstances: vegetation.vegetationInstances,
    identityInstances: vegetation.identityInstances,
    detailInstances: details.totalInstances,
    drawCalls: vegetation.drawCalls + details.drawCalls,
    triangles: vegetation.triangles + details.triangles,
  });
}

function mergeCameraViews(
  views: readonly LandscapeCameraView[],
  clearanceBounds: readonly LandscapeClearanceBound[],
): readonly LandscapeCameraView[] {
  const sceneBounds = clearanceBounds.filter(({ kind }) => kind !== 'camera');
  return Object.freeze(views.map((view) => Object.freeze({
    ...view,
    clearanceIntersections: sceneBounds.filter(({ bounds }) => boundsIntersect(bounds, view.clearanceBounds)).length,
  })));
}

export function createLandscape(
  resources: ResourceRegistry,
  group: string,
  settings: LandscapeSettings,
  data: DistrictData = DISTRICT_DATA,
): LandscapeBuildResult {
  const vegetation: VegetationBuildResult = createVegetation(resources, group, settings, data);
  const details = createDetails(resources, group, {
    density: settings.density,
    data,
    vegetationLayout: vegetation.layout,
  });
  const root = new Group();
  root.name = 'landscape';
  root.add(vegetation.root, details.root);

  const densityCounts = Object.fromEntries(DENSITIES.map((density) => {
    const detailMetrics = density === settings.density
      ? details.metrics
      : createDetailMetrics({
          density,
          data,
          vegetationLayout: createVegetationLayout(data, density),
        });
    return [density, mergeDensityMetrics(vegetation.metrics.densityCounts[density], detailMetrics)];
  })) as Readonly<Record<LandscapeDensity, LandscapeDensityMetrics>>;
  const immutableDensityCounts = Object.freeze(densityCounts);
  const active = immutableDensityCounts[settings.density];
  const clearanceBounds = Object.freeze([...vegetation.clearanceBounds, ...details.clearanceBounds]);
  const cameraViews = mergeCameraViews(vegetation.cameraViews, clearanceBounds);
  const clearanceIntersections = cameraViews.reduce(
    (total, view) => total + view.clearanceIntersections,
    0,
  );
  const staticMetrics = Object.freeze({
    settings: vegetation.settings,
    densityCounts: immutableDensityCounts,
    active,
    identities: vegetation.metrics.identities,
    lodBands: vegetation.metrics.lodBands,
    reuse: Object.freeze({
      sharedGeometryCount: vegetation.metrics.reuse.sharedGeometryCount + details.metrics.sharedGeometryCount,
      sharedMaterialCount: vegetation.metrics.reuse.sharedMaterialCount + details.metrics.sharedMaterialCount,
      instanceBatchCount: vegetation.metrics.reuse.instanceBatchCount + details.metrics.instanceBatchCount,
      instanceCount: active.vegetationInstances + active.detailInstances,
      estimatedInstancedDrawCalls: active.drawCalls,
      naiveRepeatedDrawCalls: vegetation.metrics.reuse.naiveRepeatedDrawCalls + details.metrics.naiveRepeatedDrawCalls,
    }),
    clearanceIntersections,
    transparentObjects: vegetation.metrics.transparentObjects + details.metrics.transparentObjects,
    depthWriteDisabled: vegetation.metrics.depthWriteDisabled + details.metrics.depthWriteDisabled,
  });

  return Object.freeze({
    root,
    settings: vegetation.settings,
    cameraViews,
    clearanceBounds,
    debugLayout: vegetation.debugLayout,
    get metrics(): LandscapeBuildMetrics {
      return Object.freeze({
        ...staticMetrics,
        motion: vegetation.metrics.motion,
      });
    },
    update(frame: LandscapeUpdateFrame): void {
      vegetation.update(frame);
    },
    reset(): void {
      vegetation.reset();
    },
    setCaptureTime(time: number | null): void {
      vegetation.setCaptureTime(time);
    },
  });
}
