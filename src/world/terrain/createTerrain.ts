import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Uint32BufferAttribute,
  type Object3D,
} from 'three';

import type { ResourceRegistry } from '../../render/ResourceRegistry';
import { sampleGroundHeight } from '../../exploration/navigation';
import { DISTRICT_DATA } from '../districtData';

export { sampleGroundHeight };

const TERRAIN_COLUMNS = 85;
const TERRAIN_ROWS = 73;

/** Builds the complete district ground surface from the same sampler used by navigation. */
export function createTerrain(resources: ResourceRegistry, group: string): Object3D {
  const { worldBounds } = DISTRICT_DATA;
  const positions = new Float32Array(TERRAIN_COLUMNS * TERRAIN_ROWS * 3);
  const indices: number[] = [];

  for (let row = 0; row < TERRAIN_ROWS; row += 1) {
    const z = worldBounds.minZ
      + (row / (TERRAIN_ROWS - 1)) * (worldBounds.maxZ - worldBounds.minZ);
    for (let column = 0; column < TERRAIN_COLUMNS; column += 1) {
      const x = worldBounds.minX
        + (column / (TERRAIN_COLUMNS - 1)) * (worldBounds.maxX - worldBounds.minX);
      const offset = (row * TERRAIN_COLUMNS + column) * 3;
      positions[offset] = x;
      positions[offset + 1] = sampleGroundHeight(x, z);
      positions[offset + 2] = z;
    }
  }

  for (let row = 0; row < TERRAIN_ROWS - 1; row += 1) {
    for (let column = 0; column < TERRAIN_COLUMNS - 1; column += 1) {
      const topLeft = row * TERRAIN_COLUMNS + column;
      const bottomLeft = topLeft + TERRAIN_COLUMNS;
      indices.push(
        topLeft,
        bottomLeft,
        topLeft + 1,
        topLeft + 1,
        bottomLeft,
        bottomLeft + 1,
      );
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(new Uint32BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  resources.register(geometry, group);

  const material = resources.register(new MeshBasicMaterial({
    color: new Color(0xb7b09b),
  }), group);
  const terrain = new Mesh(geometry, material);
  terrain.name = 'district-terrain';

  const root = new Group();
  root.name = 'terrain-root';
  root.add(terrain);
  return root;
}
