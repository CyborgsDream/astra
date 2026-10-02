/** Partition the authored ward without changing collision or gameplay metadata. */
export const CELL_SIZE = 48;

export function isGlobalInstance(instance, cellSize = CELL_SIZE) {
  if ((instance.detail ?? 0) === 0) return true;
  // A rotation-invariant conservative diameter also catches long tilted cables.
  const scale = instance.scale || [1, 1, 1];
  return Math.hypot(scale[0], scale[1], scale[2]) >= cellSize;
}

export function partitionWorld(source) {
  if (!Array.isArray(source.instances) || !Array.isArray(source.cells)) {
    throw new TypeError('A streamed world needs instance and cell arrays.');
  }
  const chunks = new Map(source.cells.map(cell => [cell.id, []]));
  const globalInstances = [];
  for (const instance of source.instances) {
    const chunk = chunks.get(instance.cell);
    if (!chunk || isGlobalInstance(instance)) globalInstances.push(instance);
    else chunk.push(instance);
  }
  const world = {
    ...source,
    instances: globalInstances,
    instanceCount: source.instances.length,
    cells: source.cells.map(cell => ({ ...cell, detailInstanceCount: chunks.get(cell.id).length })),
  };
  return { world, chunks, globalInstances };
}

export function distanceToCell(cell, position) {
  const [minX, minZ, maxX, maxZ] = cell.bounds;
  return Math.hypot(
    Math.max(minX - position[0], 0, position[0] - maxX),
    Math.max(minZ - position[2], 0, position[2] - maxZ),
  );
}

/** Retention bias prevents repeated exchanges while walking along a boundary. */
export function selectResidentCells(cells, position, residentIds = [], { maxCells = 9, hysteresis = 8 } = {}) {
  if (!position || position.length < 3 || !Array.from(position).every(Number.isFinite)) {
    throw new TypeError('Cell focus needs three finite position values.');
  }
  const resident = new Set(residentIds);
  return cells.map(cell => ({
    cell,
    distance: distanceToCell(cell, position) - (resident.has(cell.id) ? hysteresis : 0),
  })).sort((a, b) => a.distance - b.distance || a.cell.id.localeCompare(b.cell.id))
    .slice(0, Math.max(1, Math.floor(maxCells))).map(entry => entry.cell.id);
}
