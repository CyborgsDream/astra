/* Switchback Ward: deterministic, dependency-free architectural world data. */

const TAU = Math.PI * 2;
const C = {
  concrete: [0.49, 0.51, 0.48], lightConcrete: [0.66, 0.66, 0.59], darkConcrete: [0.30, 0.34, 0.33],
  jade: [0.24, 0.48, 0.41], teal: [0.24, 0.40, 0.40], paleJade: [0.49, 0.62, 0.53],
  brick: [0.48, 0.29, 0.24], red: [0.47, 0.24, 0.25], rust: [0.48, 0.30, 0.22],
  cream: [0.76, 0.73, 0.61], metal: [0.36, 0.40, 0.39], darkMetal: [0.17, 0.22, 0.22],
  glass: [0.15, 0.26, 0.28], warmGlass: [0.36, 0.34, 0.26], rubber: [0.09, 0.12, 0.12],
  asphalt: [0.27, 0.29, 0.28], paving: [0.44, 0.46, 0.41], yellow: [0.69, 0.57, 0.26],
  wood: [0.43, 0.34, 0.24], green: [0.26, 0.38, 0.21], leaf: [0.34, 0.45, 0.25],
  blue: [0.25, 0.38, 0.48], paper: [0.61, 0.58, 0.48], water: [0.20, 0.29, 0.29],
};

const SHOP_NAMES = [
  'THREE KETTLES', 'NORI REPAIRS', 'ORBIT LAUNDRY', 'SECOND LIFE ELECTRIC', 'MAI & SONS',
  'EVERYDAY RATIONS', 'PATCH / STITCH', 'SALT & STEAM', 'COMMON GOODS', 'BRASS LANTERN',
  'NORTHLINE PARCELS', 'CYCLE / CELL', 'LOW CITY RADIO', 'BREAD AT SIX', 'COPPER EXCHANGE',
  'JUNO SPARES', 'LAST MILE', 'BOWL HOUSE', 'FOUR FLOORS HOME', 'WATER COOPERATIVE',
  'MENDER', 'OLD CURRENT', 'FRESH FROM LEVEL 9', 'GLASS & GRIT',
];

function hash(seed, ...parts) {
  let h = (seed | 0) ^ 0x9e3779b9;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 16777619); h ^= h >>> 13; }
  }
  return h >>> 0;
}

function random(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mixColor(a, b, t) { return a.map((v, i) => v * (1 - t) + b[i] * t); }
function tint(c, amount) { return c.map(v => Math.max(0.035, Math.min(0.95, v + amount))); }
function intersects(a, b, pad = 0) { return a[0] < b[2] + pad && a[2] > b[0] - pad && a[1] < b[3] + pad && a[3] > b[1] - pad; }
function distSegment(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

// Continuous footprint intersection prevents sparse navigation samples from
// accepting a diagonal that clips a building corner. Also shared by air routes.
function segmentIntersectsFootprint(a, b, min, max, padding = 0) {
  let enter = 0, leave = 1;
  for (const axis of [0, 2]) {
    const delta = b[axis] - a[axis], lower = min[axis] - padding, upper = max[axis] + padding;
    if (Math.abs(delta) < 1e-9) {
      if (a[axis] < lower || a[axis] > upper) return false;
    } else {
      const first = (lower - a[axis]) / delta, last = (upper - a[axis]) / delta;
      enter = Math.max(enter, Math.min(first, last));
      leave = Math.min(leave, Math.max(first, last));
      if (enter > leave) return false;
    }
  }
  return true;
}

export function generateDistrict(seed = 73191) {
  seed = Number.isFinite(Number(seed)) ? Number(seed) >>> 0 : 73191;
  const instances = [], colliders = [], ramps = [], interactables = [], locations = [], navNodes = [], navEdges = [], signs = [], routePaths = [];
  const bounds = { minX: -84, maxX: 84, minZ: -72, maxZ: 72 };
  const cells = [];
  for (let z = -2; z <= 1; z++) for (let x = -2; x <= 1; x++) cells.push({ id: `${x},${z}`, x, z, bounds: [x * 48, z * 48, (x + 1) * 48, (z + 1) * 48] });
  const rng = random(hash(seed, 'district'));
  const pick = (a, r = rng) => a[Math.floor(r() * a.length)];
  let serial = 0;
  const cellAt = (x, z) => `${Math.floor(x / 48)},${Math.floor(z / 48)}`;
  const signIndex = new Map();
  const nodeIndex = new Map();
  const occupiedPlots = [];
  const fixedRects = [];
  const footprint = (x, z, w, d) => [x - w / 2, z - d / 2, x + w / 2, z + d / 2];
  const reserve = (x, z, w, d, pad = 1.1) => fixedRects.push([x - w / 2 - pad, z - d / 2 - pad, x + w / 2 + pad, z + d / 2 + pad]);

  function add(mesh, position, scale, color, material = 0, detail = 1, extra = {}) {
    const item = { mesh, position, scale, color, material, roughness: material === 2 ? 0.3 : material === 1 ? 0.72 : 0.91, detail, cell: cellAt(position[0], position[2]), ...extra };
    instances.push(item);
    return item;
  }
  function box(x, y, z, w, h, d, color = C.concrete, material = 0, detail = 1, extra = {}) {
    return add('box', [x, y, z], [w, h, d], color, material, detail, extra);
  }
  function cylinder(x, y, z, diameter, h, color = C.metal, material = 1, detail = 1, extra = {}) {
    return add('cylinder', [x, y, z], [diameter, h, diameter], color, material, detail, extra);
  }
  function sphere(x, y, z, w, h, d, color, material = 0, detail = 2) { return add('sphere', [x, y, z], [w, h, d], color, material, detail); }
  function collision(id, x, y, z, w, h, d, extra = {}) {
    colliders.push({ id: id || `solid_${serial++}`, min: [x - w / 2, y - h / 2, z - d / 2], max: [x + w / 2, y + h / 2, z + d / 2], type: 'solid', ...extra });
  }
  function solid(id, x, y, z, w, h, d, color = C.concrete, material = 0, detail = 0) {
    box(x, y, z, w, h, d, color, material, detail);
    collision(id, x, y, z, w, h, d);
  }
  function floor(id, x1, z1, x2, z2, y, thickness = 0.24, color = C.concrete, material = 0) {
    solid(id, (x1 + x2) / 2, y - thickness / 2, (z1 + z2) / 2, x2 - x1, thickness, z2 - z1, color, material);
  }
  function rod(a, b, diameter, color = C.darkMetal, detail = 1) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], length = Math.hypot(dx, dy, dz);
    if (length < 0.001) return;
    add('cylinder', [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [diameter, length, diameter], color, 1, detail,
      { rotation: [Math.acos(Math.max(-1, Math.min(1, dy / length))), Math.atan2(dx, dz), 0] });
  }
  function cable(a, b, sag = 0.45, diameter = 0.035, detail = 1) {
    let prev = a;
    const segments = Math.max(4, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 2.4));
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t];
      rod(prev, p, diameter, C.rubber, detail); prev = p;
    }
  }
  function sign(text, x, y, z, w = 2.2, h = 0.52, yaw = 0, color = C.cream, emissive = 0.08) {
    let tile = signIndex.get(text);
    if (tile === undefined) {
      if (signs.length >= 128) { text = 'SWITCHBACK WARD'; tile = signIndex.get(text) || 0; }
      else { tile = signs.length; signs.push(text); signIndex.set(text, tile); }
    }
    box(x, y, z, w + 0.12, h + 0.10, 0.085, C.darkMetal, 1, 1, { rotation: [0, yaw, 0] });
    add('quad', [x + Math.sin(yaw) * 0.048, y, z + Math.cos(yaw) * 0.048], [w, h, 1], color, 8, 1, { rotation: [0, yaw, 0], tile, emissive });
  }
  function interact(id, type, name, position, extra = {}) { interactables.push({ id, type, name, position, radius: 2.5, ...extra }); }
  function location(id, name, position, radius, level, description) { locations.push({ id, name, position, radius, level, description }); }
  function node(id, p, kind = 'foot') {
    if (!nodeIndex.has(id)) { const n = { id, position: p, kind, neighbours: [] }; navNodes.push(n); nodeIndex.set(id, n); }
    return id;
  }
  const edgeKeys = new Set();
  function edge(a, b) {
    if (a === b || !nodeIndex.has(a) || !nodeIndex.has(b)) return;
    const key = [a, b].sort().join('|');
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key); navEdges.push([a, b]); nodeIndex.get(a).neighbours.push(b); nodeIndex.get(b).neighbours.push(a);
  }
  function rail(a, b, y, h = 0.95, physical = false, color = C.metal, opening = false) {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 0.1 || opening) return;
    for (let i = 0, n = Math.ceil(len / 1.35); i <= n; i++) {
      const t = i / n; cylinder(a[0] + dx * t, y + h / 2, a[1] + dz * t, 0.055, h, color, 1, 1);
    }
    for (const height of [h * 0.45, h]) rod([a[0], y + height, a[1]], [b[0], y + height, b[1]], 0.047, color);
    if (physical) collision(null, (a[0] + b[0]) / 2, y + h / 2, (a[1] + b[1]) / 2, Math.abs(dx) + 0.055, h, Math.abs(dz) + 0.055);
  }
  function roofEdges(x, z, w, d, y, gaps = {}) {
    const sides = [
      ['south', [x - w / 2, z - d / 2], [x + w / 2, z - d / 2]],
      ['north', [x - w / 2, z + d / 2], [x + w / 2, z + d / 2]],
      ['west', [x - w / 2, z - d / 2], [x - w / 2, z + d / 2]],
      ['east', [x + w / 2, z - d / 2], [x + w / 2, z + d / 2]],
    ];
    for (const [name, a, b] of sides) {
      const gap = gaps[name];
      if (!gap) rail(a, b, y, 0.86, true);
      else {
        const axis = name === 'south' || name === 'north' ? 0 : 1;
        const aa = [...a], bb = [...b]; aa[axis] = gap[0]; bb[axis] = gap[1];
        if (aa[axis] > a[axis]) rail(a, aa, y, 0.86, true);
        if (bb[axis] < b[axis]) rail(bb, b, y, 0.86, true);
      }
    }
  }
  function walkway(id, ax, az, bx, bz, y, width = 2.6, options = {}) {
    const alongX = Math.abs(bx - ax) >= Math.abs(bz - az);
    const x1 = Math.min(ax, bx) - (alongX ? 0 : width / 2), x2 = Math.max(ax, bx) + (alongX ? 0 : width / 2);
    const z1 = Math.min(az, bz) - (alongX ? width / 2 : 0), z2 = Math.max(az, bz) + (alongX ? width / 2 : 0);
    floor(id, x1, z1, x2, z2, y, 0.22, C.darkConcrete);
    const start = (alongX ? x1 : z1) + width * .54, end = (alongX ? x2 : z2) - width * .54;
    let spans = start < end ? [[start,end]] : [];
    for (const gap of options.gaps || []) spans = spans.flatMap(([a,b]) => b <= gap[0] || a >= gap[1] ? [[a,b]] : [[a,Math.max(a,gap[0])],[Math.min(b,gap[1]),b]].filter(([s,e]) => e-s>.06));
    for(const [a,b] of spans) {
      if (alongX) { rail([a,z1],[b,z1],y,.95,true); rail([a,z2],[b,z2],y,.95,true); }
      else { rail([x1,a],[x1,b],y,.95,true); rail([x2,a],[x2,b],y,.95,true); }
    }
    const len = Math.hypot(bx - ax, bz - az);
    if (options.supports) for (let q = 0.2; q < 1; q += Math.max(0.15, 7 / len)) {
      const x = ax + (bx - ax) * q, z = az + (bz - az) * q;
      for (const side of [-1, 1]) {
        const px = x + (alongX ? 0 : side * width * 0.55), pz = z + (alongX ? side * width * 0.55 : 0);
        solid(`${id}_support_${q}_${side}`, px, y / 2 - 0.12, pz, 0.23, y - 0.24, 0.23, C.darkMetal, 1);
      }
    }
    return { x1, z1, x2, z2 };
  }
  function stairs(id, x, z, width, depth, y0, y1, axis = 'z', color = C.concrete) {
    ramps.push({ id, x, z, width, depth, y0, y1, axis });
    const length = axis === 'x' ? width : depth, stairWidth = axis === 'x' ? depth : width;
    const n = Math.ceil(Math.abs(y1 - y0) / 0.18), run = length / n;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, top = y0 + (y1 - y0) * ((i + 1) / n);
      const px = x + (axis === 'x' ? (t - 0.5) * length : 0), pz = z + (axis === 'z' ? (t - 0.5) * length : 0);
      box(px, top - 0.09, pz, axis === 'x' ? run : stairWidth, 0.18, axis === 'z' ? run : stairWidth, color, 0, 0);
      box(px, top + 0.006, pz, axis === 'x' ? 0.045 : stairWidth, 0.012, axis === 'z' ? 0.045 : stairWidth, C.lightConcrete, 0, 1);
    }
    const ends = [-1, 1];
    for (const side of ends) {
      const a = [x - (axis === 'x' ? length / 2 : 0) + (axis === 'z' ? side * (stairWidth / 2 + 0.06) : 0), y0 + 0.95, z - (axis === 'z' ? length / 2 : 0) + (axis === 'x' ? side * (stairWidth / 2 + 0.06) : 0)];
      const b = [x + (axis === 'x' ? length / 2 : 0) + (axis === 'z' ? side * (stairWidth / 2 + 0.06) : 0), y1 + 0.95, z + (axis === 'z' ? length / 2 : 0) + (axis === 'x' ? side * (stairWidth / 2 + 0.06) : 0)];
      rod(a, b, 0.065, C.metal);
      rod([a[0], a[1] - 0.48, a[2]], [b[0], b[1] - 0.48, b[2]], 0.045, C.metal);
      for (let i = 0, count = Math.ceil(length / 1.25); i <= count; i++) {
        const t = i / count, py = y0 + (y1 - y0) * t;
        cylinder(a[0] + (b[0] - a[0]) * t, py + 0.48, a[2] + (b[2] - a[2]) * t, 0.055, 0.96, C.metal);
      }
      rod([a[0], a[1] - 1.16, a[2]], [b[0], b[1] - 1.16, b[2]], 0.14, C.darkMetal);
    }
    return id;
  }
  function ladder(x, z, y0, y1, face = 'east') {
    const alongZ = face === 'east' || face === 'west';
    for (const s of [-1, 1]) rod([x + (alongZ ? 0 : s * 0.38), y0, z + (alongZ ? s * 0.38 : 0)], [x + (alongZ ? 0 : s * 0.38), y1 + 0.65, z + (alongZ ? s * 0.38 : 0)], 0.065, C.rust);
    for (let y = y0 + 0.2; y < y1 + 0.6; y += 0.3) rod([x - (alongZ ? 0 : 0.38), y, z - (alongZ ? 0.38 : 0)], [x + (alongZ ? 0 : 0.38), y, z + (alongZ ? 0.38 : 0)], 0.05, C.metal);
  }
  function crate(x, y, z, w = 0.75, h = 0.6, d = 0.65, color = C.wood, r = rng) {
    box(x, y + h / 2, z, w, h, d, tint(color, (r() - 0.5) * 0.08), 4, 2);
    for (const s of [-1, 1]) {
      box(x + s * w * 0.39, y + h / 2, z, 0.055, h + 0.025, d + 0.03, C.wood, 4, 2);
      box(x, y + h * 0.81, z + s * d / 2, w, 0.07, 0.03, C.darkMetal, 1, 2);
    }
    box(x, y + h + 0.006, z, w * 0.33, 0.015, d * 0.55, C.paper, 0, 2);
  }
  function barrel(x, y, z, color = C.teal) {
    cylinder(x, y + 0.45, z, 0.59, 0.9, color, 1, 2);
    for (const h of [0.1, 0.77, 0.9]) cylinder(x, y + h, z, 0.61, 0.055, C.darkMetal, 1, 2);
    cylinder(x + 0.14, y + 0.94, z, 0.09, 0.04, C.rust, 1, 2);
  }
  function bench(x, y, z, yaw = 0) {
    const dx = Math.cos(yaw), dz = -Math.sin(yaw), nx = Math.sin(yaw), nz = Math.cos(yaw);
    box(x, y + 0.44, z, 1.7, 0.10, 0.48, C.wood, 4, 1, { rotation: [0, yaw, 0] });
    for (const s of [-1, 1]) box(x + dx * s * 0.63, y + 0.2, z + dz * s * 0.63, 0.10, 0.4, 0.39, C.darkMetal, 1, 1, { rotation: [0, yaw, 0] });
    for (const h of [0.7, 0.9]) box(x + nx * 0.23, y + h, z + nz * 0.23, 1.7, 0.13, 0.045, C.wood, 4, 1, { rotation: [0, yaw, 0] });
  }
  function plant(x, y, z, radius = 0.45, r = rng) {
    cylinder(x, y + 0.18, z, radius * 1.3, 0.36, C.rust, 0, 2);
    cylinder(x, y + 0.365, z, radius * 1.36, 0.05, C.darkConcrete, 0, 2);
    for (let k = 0; k < 6; k++) {
      const a = r() * TAU, rr = r() * radius * 0.45, h = 0.30 + r() * 0.55;
      rod([x, y + 0.36, z], [x + Math.cos(a) * rr, y + h + 0.36, z + Math.sin(a) * rr], 0.025, C.green, 2);
      sphere(x + Math.cos(a) * rr, y + h + 0.25, z + Math.sin(a) * rr, radius * 0.6, 0.18, radius * 0.32, pick([C.green, C.leaf], r), 7);
    }
  }
  function weeds(x, y, z, r = rng, count = 4) {
    for (let i = 0; i < count; i++) {
      const px = x + (r() - 0.5) * 0.5, pz = z + (r() - 0.5) * 0.5, h = 0.13 + r() * 0.42;
      add('cone', [px, y + h / 2, pz], [0.04 + r() * 0.09, h, 0.07], pick([C.green, C.leaf, C.wood], r), 7, 2, { rotation: [(r() - 0.5) * 0.3, r() * TAU, (r() - 0.5) * 0.4] });
    }
  }
  function litter(x, y, z, r, count = 8) {
    for (let i = 0; i < count; i++) {
      const px = x + (r() - 0.5) * 1.5, pz = z + (r() - 0.5) * 1.3, type = Math.floor(r() * 5);
      if (type === 0) box(px, y + 0.026, pz, 0.18 + r() * 0.26, 0.035, 0.19 + r() * 0.2, C.paper, 0, 2, { rotation: [0, r() * TAU, 0] });
      else if (type === 1) add('cylinder', [px, y + 0.09, pz], [0.1, 0.27, 0.1], C.paleJade, 2, 2, { rotation: [Math.PI / 2, r() * TAU, 0] });
      else if (type === 2) sphere(px, y + 0.15, pz, 0.4, 0.30, 0.32, C.darkConcrete, 5);
      else if (type === 3) box(px, y + 0.08, pz, 0.27, 0.15, 0.20, C.wood, 4, 2, { rotation: [0.03, r() * TAU, 0.02] });
      else cylinder(px, y + 0.055, pz, 0.11, 0.11, C.metal, 1, 2);
    }
  }
  function binCluster(x, y, z, r) {
    for (let k = 0; k < 2; k++) {
      box(x + k * 0.72, y + 0.46, z, 0.63, 0.87, 0.6, k ? C.darkConcrete : C.teal, 1, 1);
      box(x + k * 0.72, y + 0.91, z, 0.68, 0.1, 0.66, C.darkMetal, 1, 1, { rotation: [k ? -0.12 : 0, 0, 0] });
      for (const s of [-1, 1]) sphere(x + k * 0.72 + s * 0.2, y + 0.1, z + 0.19, 0.12, 0.12, 0.12, C.rubber, 1);
    }
    litter(x - 0.4, y, z + 0.5, r, 8); weeds(x + 1, y, z - 0.15, r);
    box(x + 0.4, y + 0.009, z + 0.15, 2.5, 0.018, 1.2, C.darkConcrete, 3, 2);
  }
  function table(x, y, z, w = 1.1, d = 0.75) {
    box(x, y + 0.75, z, w, 0.08, d, C.wood, 4, 1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(x + sx * (w / 2 - 0.1), y + 0.36, z + sz * (d / 2 - 0.1), 0.07, 0.72, 0.07, C.darkMetal, 1, 1);
  }
  function terminal(x, y, z, label, yaw = 0, color = C.teal) {
    box(x, y + 0.83, z, 0.62, 1.66, 0.5, C.darkMetal, 1, 1, { rotation: [0, yaw, 0] });
    box(x + Math.sin(yaw) * 0.255, y + 1.15, z + Math.cos(yaw) * 0.255, 0.5, 0.49, 0.025, color, 6, 1, { rotation: [0, yaw, 0], emissive: 0.7 });
    sign(label, x + Math.sin(yaw) * 0.285, y + 1.15, z + Math.cos(yaw) * 0.285, 0.43, 0.27, yaw, C.cream, 0.4);
    for (let i = 0; i < 3; i++) box(x + Math.cos(yaw) * (-0.15 + i * 0.15) + Math.sin(yaw) * 0.27, y + 0.65, z - Math.sin(yaw) * (-0.15 + i * 0.15) + Math.cos(yaw) * 0.27, 0.08, 0.055, 0.03, C.yellow, 1, 2, { rotation: [0, yaw, 0] });
  }
  function waterTank(x, y, z, r, diameter = 2) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(x + sx * diameter * 0.29, y + 0.48, z + sz * diameter * 0.29, 0.12, 0.96, 0.12, C.rust, 1, 1);
    cylinder(x, y + 1.85, z, diameter, 2.1, C.darkConcrete, 1, 1);
    for (const h of [0.86, 1.5, 2.4, 2.88]) cylinder(x, y + h, z, diameter + 0.06, 0.055, C.metal, 1, 1);
    add('cone', [x, y + 3.04, z], [diameter + 0.05, 0.32, diameter + 0.05], C.metal, 1, 1);
    rod([x + diameter / 2, y + 1.1, z], [x + diameter / 2 + 0.36, y + 1.1, z], 0.12, C.rust);
    rod([x + diameter / 2 + 0.36, y + 1.1, z], [x + diameter / 2 + 0.36, y + 0.1, z], 0.12, C.rust);
    for (let i = 0; i < 4; i++) box(x - diameter * 0.35 + r() * diameter * 0.7, y + 1.45 + r(), z + diameter * 0.502, 0.05 + r() * 0.12, 0.3 + r() * 0.65, 0.016, C.rust, 1, 2);
  }
  function hvac(x, y, z, w = 1.2, d = 0.9) {
    box(x, y + 0.48, z, w, 0.9, d, C.lightConcrete, 1, 1);
    for (let i = 0; i < 8; i++) box(x, y + 0.18 + i * 0.078, z + d / 2 + 0.01, w * 0.8, 0.035, 0.025, C.darkMetal, 1, 2);
    cylinder(x, y + 0.95, z, Math.min(w, d) * 0.75, 0.06, C.darkMetal, 1, 2);
    for (let i = 0; i < 5; i++) box(x, y + 0.99, z, w * 0.58, 0.025, 0.045, C.metal, 1, 2, { rotation: [0, i * Math.PI / 5, 0] });
  }

  const roads = [
    { points: [[0,-72],[0,-30],[-8,-6],[-8,22],[2,42],[2,72]], width: 5.5 },
    { points: [[-84,-26],[-24,-26],[16,-26],[40,-22],[84,-22]], width: 6.5 },
    { points: [[48,-72],[48,-18],[54,12],[48,40],[48,72]], width: 4.2 },
  ];
  const footWays = [
    [[-79,24],[-25,24],[-8,22],[22,24],[51,24],[79,24]],
    [[-72,-35],[-65,-34],[-46,-29],[-21,-29],[-17,-17],[-21,-9],[-21,17],[-25,24]],
    [[-80,-48],[-70,-48],[-70,-33]],
    [[-23,-69],[-23,-56],[-23,-40],[-21,-29]],
    [[-77,49],[-63,49],[-63,29]],
    [[56,-49],[62,-49],[62,-27],[54,-22]],
    [[59,43],[53,43],[48,40]],
    [[-35,29],[-35,65]],
  ];

  // The surface slab is explicitly cut for both underground entrances.
  const groundHoles = [[-66.8,-51.2,-63.2,-35.5],[-21.5,-58.5,-18.5,-55.5]];
  function subtractRect(rect, cut) {
    if (!intersects(rect, cut)) return [rect];
    const [x1,z1,x2,z2] = rect, ax = Math.max(x1,cut[0]), az = Math.max(z1,cut[1]), bx = Math.min(x2,cut[2]), bz = Math.min(z2,cut[3]);
    const out = [];
    if (az > z1) out.push([x1,z1,x2,az]);
    if (bz < z2) out.push([x1,bz,x2,z2]);
    if (ax > x1) out.push([x1,az,ax,bz]);
    if (bx < x2) out.push([bx,az,x2,bz]);
    return out.filter(r => r[2]-r[0] > 0.005 && r[3]-r[1] > 0.005);
  }
  let groundRects = [[bounds.minX - 3,bounds.minZ - 3,bounds.maxX + 3,bounds.maxZ + 3]];
  for (const cut of groundHoles) groundRects = groundRects.flatMap(r => subtractRect(r, cut));
  groundRects.forEach((r,i) => floor(`ground_${i}`,r[0],r[1],r[2],r[3],0,0.32,C.paving,11));
  const onRoad = (x,z,margin = 0) => roads.some(rd => rd.points.slice(1).some((b,i) => distSegment(x,z,rd.points[i],b) < rd.width/2 + margin));
  const holeAt = (x,z,pad = 0) => groundHoles.some(h => x > h[0]-pad && x < h[2]+pad && z > h[1]-pad && z < h[3]+pad);
  const groundRng = random(hash(seed,'ground-wear'));
  for (let x=-83; x<84; x+=3.7) for (let z=-71; z<72; z+=3.7) {
    if (holeAt(x,z,2)) continue;
    const roadway = onRoad(x,z,0.7), c = roadway ? C.asphalt : C.paving;
    box(x,0.004,z,3.63,0.009,3.62,tint(c,(groundRng()-.5)*.055),roadway?3:11,1);
    if (groundRng()<.75) {
      const px=x+(groundRng()-.5)*2.4,pz=z+(groundRng()-.5)*2.4;
      box(px,0.018,pz,.5+groundRng()*1.8,.012,.3+groundRng()*.9,tint(c,(groundRng()-.5)*.09),roadway?3:11,2,{rotation:[0,groundRng()*.4,0]});
    }
    if (groundRng()<.62) {
      const a=[x-1.5+groundRng()*2,0.03,z-1.4+groundRng()*2];
      const b=[a[0]+.3+groundRng()*.6,0.03,a[2]+.2+groundRng()*.9];
      rod(a,b,.018,C.darkConcrete,2);
      if(groundRng()<.4) rod(b,[b[0]-.2,0.03,b[2]+.4],.014,C.darkConcrete,2);
    }
  }
  roads.forEach((rd,ri) => rd.points.slice(1).forEach((b,j) => {
    const a=rd.points[j],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz);
    box((a[0]+b[0])/2,.012,(a[1]+b[1])/2,rd.width,.014,len,C.asphalt,3,0,{rotation:[0,yaw,0]});
    for(let l=3;l<len;l+=8.5) {
      const t=l/len,x=a[0]+dx*t,z=a[1]+dz*t;
      box(x,.029,z,.09,.015,1.5,tint(C.cream,-.17),11,2,{rotation:[0,yaw,0]});
      for(const side of [-1,1]) {
        const px=x+Math.cos(yaw)*side*(rd.width/2+.2),pz=z-Math.sin(yaw)*side*(rd.width/2+.2);
        if(!holeAt(px,pz,.8)) {
          box(px,.052,pz,.35,.1,1.15,C.darkConcrete,1,1,{rotation:[0,yaw,0]});
          for(let k=0;k<7;k++) box(px+Math.sin(yaw)*(-.45+k*.15),.109,pz+Math.cos(yaw)*(-.45+k*.15),.29,.015,.055,C.rubber,1,2,{rotation:[0,yaw,0]});
        }
      }
    }
    const n=Math.ceil(len/5.5);
    let prev;
    for(let k=0;k<=n;k++) {
      const id=`road_${ri}_${j}_${k}`,t=k/n;
      node(id,[a[0]+dx*t,0,a[1]+dz*t],'road'); if(prev)edge(prev,id);prev=id;
    }
  }));
  // Connect road junctions by proximity; every vehicle lane participates in one network.
  const roadNodes=navNodes.filter(n=>n.kind==='road');
  for(let a=0;a<roadNodes.length;a++) for(let b=a+1;b<roadNodes.length;b++) if(Math.hypot(roadNodes[a].position[0]-roadNodes[b].position[0],roadNodes[a].position[2]-roadNodes[b].position[2])<5.2) edge(roadNodes[a].id,roadNodes[b].id);

  // Authored envelopes and their approach corridors are protected from infill.
  reserve(-32,-11,16,16); reserve(-34,-47,11,14); reserve(-47,11,14,12);
  reserve(-7,-2,29,30,.3); reserve(29,34,16,17); reserve(64,-43,18,23);
  reserve(-47,45,22,18); reserve(65,43,18,21); reserve(29,58,12,14);
  reserve(-57,-56,10,10); reserve(-65,-43,5,22); reserve(-20,-57,4,4);
  reserve(-56,11,3.2,27); reserve(-32,4,3.4,16); reserve(-39.5,7,18,3.4);
  reserve(-35,32,4.2,19); reserve(8,38,4,28); reserve(13,55.5,25,8.5);
  reserve(-25.6,-47,4.8,19); reserve(-20,1,5.5,6); reserve(-14,29,6,6);
  reserve(0,61,174,6.4,.25);

  function sidePoint(b,side,t,y,offset=0) {
    if(side==='north')return[b.x+t,y,b.z+b.d/2+offset];
    if(side==='south')return[b.x+t,y,b.z-b.d/2-offset];
    if(side==='east')return[b.x+b.w/2+offset,y,b.z+t];
    return[b.x-b.w/2-offset,y,b.z+t];
  }
  function sideBox(b,side,t,y,w,h,depth,offset,color,mat=0,detail=1,extra={}) {
    const p=sidePoint(b,side,t,y,offset);
    return box(...p,side==='east'||side==='west'?depth:w,h,side==='east'||side==='west'?w:depth,color,mat,detail,extra);
  }
  const sideYaw=side=>side==='north'?0:side==='east'?Math.PI/2:side==='south'?Math.PI:-Math.PI/2;
  function window(b,side,t,y,w,h,r,lit=false) {
    sideBox(b,side,t,y,w+.24,h+.22,.08,.018,C.darkConcrete,0,1);
    sideBox(b,side,t,y,w,h,.024,.065,lit?C.warmGlass:tint(C.glass,(r()-.5)*.08),2,1,{emissive:lit?.1:0});
    for(const s of [-1,1]) sideBox(b,side,t+s*(w/2+.035),y,.085,h+.16,.22,.125,pick([C.cream,C.metal,C.darkMetal],r),1,1);
    for(const s of [-1,1]) sideBox(b,side,t,y+s*(h/2+.025),w+.17,.085,.22,.125,C.metal,1,1);
    sideBox(b,side,t,y,w+.06,.055,.18,.15,C.metal,1,1);
    if(r()<.58)sideBox(b,side,t,y,.045,h,.17,.14,C.metal,1,1);
    sideBox(b,side,t,y-h/2-.105,w+.28,.1,.42,.16,C.lightConcrete,0,1);
    if(r()<.34)sideBox(b,side,t+w*.24,y,w*.36,h*.92,.025,.086,pick([C.cream,C.teal,C.red],r),5,2);
  }
  function wallUnit(b,side,t,y,r) {
    const p=sidePoint(b,side,t,y,.42),yaw=sideYaw(side);
    box(...p,side==='east'||side==='west'?.56:1.05,.65,side==='east'||side==='west'?1.05:.56,C.lightConcrete,1,1);
    for(let i=0;i<6;i++)sideBox(b,side,t,y-.23+i*.09,.84,.038,.028,.72,C.darkMetal,1,2);
    sideBox(b,side,t,y-.41,1.21,.06,.81,.38,C.rust,1,2);
    const q=sidePoint(b,side,t+.65,y,.18),bottom=sidePoint(b,side,t+.65,.32,.18);
    rod(q,bottom,.055,C.cream,2);
    const leak=sidePoint(b,side,t+.65,.014,.53);
    box(leak[0],.018,leak[2],.35,.015,.55,C.darkConcrete,3,2,{rotation:[0,yaw,0]});
  }
  function balcony(b,side,t,y,w,r) {
    const out=.68,depth=1.32,p=sidePoint(b,side,t,y,out),sideways=side==='east'||side==='west';
    box(p[0],y-.12,p[2],sideways?depth:w,.2,sideways?w:depth,C.darkConcrete,0,1);
    const a=sidePoint(b,side,t-w/2,y,1.3),bb=sidePoint(b,side,t+w/2,y,1.3);
    rail([a[0],a[2]],[bb[0],bb[2]],y,.91,false,pick([C.metal,C.rust],r));
    for(const s of [-1,1]){
      const aa=sidePoint(b,side,t+s*w/2,y,.08),ab=sidePoint(b,side,t+s*w/2,y,1.3);
      rail([aa[0],aa[2]],[ab[0],ab[2]],y,.91);
    }
    sideBox(b,side,t,y+1.05,.74,2.05,.075,.08,C.darkMetal,1,1);
    sideBox(b,side,t,y+1.31,.54,1.22,.03,.13,C.glass,2,1);
    if(r()<.5){const p2=sidePoint(b,side,t-w*.3,y,.65);plant(p2[0],y,p2[2],.27,r);}
    else { const p2=sidePoint(b,side,t-w*.3,y+.35,.6);box(...p2,.5,.7,.45,C.cream,5,2); }
    if(r()<.3){const q=sidePoint(b,side,t,y+1.8,1.0);box(...q,w*.55,.55,.025,C.cream,5,2,{rotation:[0,sideYaw(side),.04]});}
  }
  function awning(b,side,t,y,w,r,text) {
    const p=sidePoint(b,side,t,y,.8),yaw=sideYaw(side),col=pick([C.red,C.teal,C.cream,C.yellow],r);
    box(...p,w,.11,1.8,col,5,1,{rotation:[-.09,yaw,0]});
    sideBox(b,side,t,y-.16,w,.27,.075,1.7,col,5,1);
    for(const s of [-1,1]){const a=sidePoint(b,side,t+s*(w/2-.08),y,.05),bb=sidePoint(b,side,t+s*(w/2-.08),y-.06,1.65);rod(a,bb,.047,C.darkMetal);}
    const sp=sidePoint(b,side,t,y+.45,.19);
    sign(text,...sp,w*.91,.51,yaw);
    for(let i=0;i<3;i++)sideBox(b,side,t-w*.32+i*w*.3,y-.005,.09,.02,1.68,.82,tint(col,.1),5,2);
  }
  function building(b) {
    const r=random(hash(seed,b.id,'architecture')),d=random(hash(seed,b.id,'details'));
    const floorH=b.floorH||3.3,baseH=Math.min(b.h,9.9),isTower=b.h>31;
    const col=b.color||pick([C.concrete,C.lightConcrete,C.brick,C.teal,C.jade,C.red],r);
    const upperCol=isTower?pick([C.jade,C.paleJade,C.concrete],r):tint(col,(r()-.5)*.09);
    const groundMat=col===C.brick||col===C.red?10:0;
    const underpass=b.id==='needle_house';
    const mass=(id,foot,bottom,top,color,material)=>{
      const whole=(lo,hi,suffix)=>{if(hi-lo>.01)solid(`${id}_${suffix}`,foot.x,(lo+hi)/2,foot.z,foot.w,hi-lo,foot.d,color,material);};
      if(!underpass||top<=6.8||bottom>=14){whole(bottom,top,'mass');return;}
      whole(bottom,Math.min(top,6.8),'base');whole(Math.max(bottom,14),top,'above');
      const lo=Math.max(bottom,6.8),hi=Math.min(top,14),south=foot.z-foot.d/2,north=foot.z+foot.d/2;
      if(58-south>.01)solid(`${id}_south`,foot.x,(lo+hi)/2,(south+58)/2,foot.w,hi-lo,58-south,color,material);
      if(north-64.3>.01)solid(`${id}_north`,foot.x,(lo+hi)/2,(64.3+north)/2,foot.w,hi-lo,north-64.3,color,material);
    };
    mass(`${b.id}_podium`,b,0,baseH,col,groundMat);
    let upper={...b};
    if(b.h>baseH){
      const inset=isTower?1.0:.3+r()*.65,shift=(r()-.5)*.45;
      upper={...b,w:b.w-inset*2,d:b.d-inset*1.2,x:b.x+shift};
      mass(`${b.id}_upper`,upper,baseH,b.h,upperCol,0);
      const setbackRect=[b.x-b.w/2-.15,b.z-b.d/2-.15,b.x+b.w/2+.15,b.z+b.d/2+.15];
      const setbackParts=underpass?subtractRect(setbackRect,[-100,58,100,64.3]):[setbackRect];
      setbackParts.forEach((p,i)=>floor(`${b.id}_setback_${i}`,...p,baseH,.22,C.darkConcrete));
      for(let i=0;i<3;i++)plant(b.x-b.w/2+.75+i*.75,baseH,b.z+b.d/2-.28,.22,d);
    }
    const top={...upper};
    floor(`${b.id}_roof`,top.x-top.w/2-.16,top.z-top.d/2-.16,top.x+top.w/2+.16,top.z+top.d/2+.16,b.h,.24,C.darkConcrete);
    // Ground-bearing masses stay simple; all façade depth lives in independently instanced modules.
    for(const side of ['north','south','east','west']){
      const horiz=side==='north'||side==='south';
      const floors=Math.max(2,Math.floor(b.h/floorH));
      for(let f=0;f<floors;f++){
        const at=f*floorH,fb=at>=baseH?upper:b,len=horiz?fb.w:fb.d;
        const bays=Math.max(2,Math.floor(len/(2.2+r()*.35))),bayW=len/bays;
        if(underpass&&!horiz&&at+.14>6.8&&at+.14<14){
          const south=fb.z-fb.d/2,span=58-south;if(span>.1)sideBox(fb,side,(south+58)/2-fb.z,at+.14,span,.16,.20,.075,tint(col,.06),0,1);
        }else sideBox(fb,side,0,at+.14,len+.12,.16,.20,.075,tint(col,.06),0,1);
        if(f===floors-1)sideBox(fb,side,0,Math.min(b.h-.15,at+floorH-.08),len+.3,.2,.4,.12,C.lightConcrete,0,1);
        for(let j=0;j<bays;j++){
          const t=-len/2+bayW*(j+.5),wy=at+floorH*.54;
          if(underpass&&!horiz&&wy-1<14&&wy+1>6.8&&fb.z+t>57.1&&fb.z+t<65.0)continue;
          if(f===0 && side===b.front && j%2===0){
            sideBox(fb,side,t,1.32,bayW-.35,2.46,.10,.12,C.darkMetal,1,1);
            const shutter=d()<.28;
            if(shutter){for(let k=0;k<12;k++)sideBox(fb,side,t,.27+k*.18,bayW-.42,.14,.045,.19,tint(C.metal,(k%3)*.02),1,2);}
            else {sideBox(fb,side,t,1.42,bayW-.56,1.9,.025,.185,C.glass,2,1);sideBox(fb,side,t-bayW*.28,1.36,.08,2.2,.13,.23,C.cream,1,1);}
            awning(fb,side,t,2.8,bayW-.05,d,pick(SHOP_NAMES,d));
          }else{
            const ww=Math.min(1.7,bayW*.66),wh=f===0?1.75:1.6;
            if(isTower&&f>=7){
              sideBox(fb,side,t,wy,ww+.18,wh+.2,.12,.06,C.darkConcrete,0,1);
              sideBox(fb,side,t,wy,ww,wh,.026,.13,tint(C.glass,(r()-.5)*.08),2,1);
              sideBox(fb,side,t,wy,ww+.1,.05,.14,.16,C.metal,1,1);
              sideBox(fb,side,t,wy-wh/2-.08,ww+.2,.08,.3,.13,C.lightConcrete,0,1);
            }else window(fb,side,t,wy,ww,wh,r,r()<.12);
            if(f>0&&f<5&&d()<.13)balcony(fb,side,t,at+.12,Math.min(bayW*.96,2.4),d);
            else if(f<7&&d()<.22)wallUnit(fb,side,t+ww*.36,at+.65,d);
          }
          if(d()<.28){
            const height=.35+d()*1.2;
            sideBox(fb,side,t+(d()-.5)*.8,at+.35+height/2,.09+d()*.23,height,.018,.028,tint(col,-.11),0,2);
          }
        }
      }
      const len=horiz?b.w:b.d;
      sideBox(b,side,0,.18,len,.3,.17,.09,C.darkConcrete,0,1);
      const gutter=sidePoint(b,side,len/2-.23,0,.22),gTop=[gutter[0],Math.min(b.h,baseH)+.2,gutter[2]];
      rod([gutter[0],.2,gutter[2]],gTop,.085,C.rust,1);
      for(let h=1;h<gTop[1];h+=2.2)sideBox(b,side,len/2-.23,h,.17,.055,.30,.16,C.metal,1,2);
      if(d()<.72){const p=sidePoint(b,side,-len*.31,1.34,.19);box(...p,horiz?.55:.25,.77,horiz?.25:.55,C.metal,1,1);sideBox(b,side,-len*.31,1.37,.15,.17,.028,.33,C.yellow,1,2);}
      for(let k=0;k<7;k++){
        const t=(d()-.5)*len*.8,py=.6+d()*Math.min(7,b.h-1),pw=.25+d()*.65,ph=.16+d()*.5;
        sideBox(b,side,t,py,pw,ph,.024,.04,tint(col,(d()-.5)*.18),0,2);
      }
    }
    // Roof silhouette and connected equipment, never an empty cap.
    const accessX=top.x-top.w*.29,accessZ=top.z-top.d*.24;
    solid(`${b.id}_roof_core`,accessX,b.h+1.0,accessZ,2.0,2.0,2.25,C.darkConcrete,0,1);
    box(accessX,b.h+2.07,accessZ,2.15,.16,2.43,C.metal,1,1);
    box(accessX+.25,b.h+.88,accessZ+1.135,.88,1.76,.025,C.teal,1,1);
    const tx=top.x+top.w*.22,tz=top.z+top.d*.18;
    if(d()<.7)waterTank(tx,b.h,tz,d,1.35+d()*.65);else hvac(tx,b.h,tz,1.8,1.4);
    hvac(top.x-top.w*.2,b.h,top.z+top.d*.28,1.1,.8);
    rod([tx,b.h+.22,tz],[accessX,b.h+.22,tz],.13,C.rust,1);
    rod([accessX,b.h+.22,tz],[accessX,b.h+.22,accessZ],.13,C.rust,1);
    const mast=[top.x+top.w*.34,b.h,top.z-top.d*.32];
    rod(mast,[mast[0],b.h+3.8+d()*2,mast[2]],.065,C.metal);
    for(let k=0;k<4;k++)rod([mast[0]-.58,b.h+2.6+k*.26,mast[2]],[mast[0]+.58,b.h+2.6+k*.26,mast[2]],.025,C.metal,2);
    for(const s of [-1,1]){
      box(top.x,b.h+.31,top.z+s*top.d/2,top.w+.15,.62,.18,C.lightConcrete,0,1);
      box(top.x+s*top.w/2,b.h+.31,top.z,.18,.62,top.d,C.lightConcrete,0,1);
    }
    // A front stair landing / delivery pocket makes each parcel read as an address.
    const len=b.front==='north'||b.front==='south'?b.w:b.d;
    const p=sidePoint(b,b.front,len*.28,.0,1.05);
    if(!onRoad(p[0],p[2],.8)&&!holeAt(p[0],p[2],1)){
      crate(p[0],0,p[2],.68,.55,.65,C.wood,d);
      if(d()<.6)crate(p[0]+.16,.55,p[2],.49,.4,.5,C.wood,d);
      litter(p[0]+.5,0,p[2]+.2,d,5);
    }
    const back=b.front==='north'?'south':b.front==='south'?'north':b.front==='east'?'west':'east';
    const bp=sidePoint(b,back,-len*.23,0,.75);
    if(!onRoad(bp[0],bp[2],.4)&&!holeAt(bp[0],bp[2],1))binCluster(bp[0],0,bp[2],d);
    occupiedPlots.push({id:b.id,rect:footprint(b.x,b.z,b.w,b.d),height:b.h,front:b.front});
  }

  // Hollow room shells: doors are actual omissions in the wall, and roofs are thin floor slabs.
  function room(id,x,z,w,d,y,h,color,doors=[{side:'east',offset:0,width:2.3}],options={}){
    const b={id,x,z,w,d}; const r=random(hash(seed,id,'room'));
    floor(`${id}_floor`,x-w/2,z-d/2,x+w/2,z+d/2,y,.24,options.floorColor||C.lightConcrete,11);
    floor(`${id}_ceiling`,x-w/2-.12,z-d/2-.12,x+w/2+.12,z+d/2+.12,y+h,.22,C.darkConcrete);
    for(const side of ['north','south','east','west']){
      const horiz=side==='north'||side==='south',len=horiz?w:d,sideDoors=doors.filter(q=>q.side===side);
      const bays=Math.max(2,Math.floor(len/2.8)),step=len/bays;
      for(let k=0;k<bays;k++){
        const l=-len/2+k*step,rr=l+step,t=(l+rr)/2,door=sideDoors.find(q=>Math.abs(t-q.offset)<step*.65);
        if(door){
          const dw=Math.min(door.width,step-.18),dh=2.55;
          for(const s of [-1,1]){
            const p=sidePoint(b,side,t+s*(dw/2+(step-dw)/4),y+h/2,0);
            solid(`${id}_${side}_door_pier_${k}_${s}`,...p,horiz?(step-dw)/2:.28,h,horiz?.28:(step-dw)/2,color,0,0);
          }
          const p=sidePoint(b,side,t,y+(h+dh)/2,0);
          solid(`${id}_${side}_door_head_${k}`,...p,horiz?dw:.28,h-dh,horiz?.28:dw,color,0,0);
          sideBox(b,side,t,y+dh+.1,dw+.22,.13,.41,.06,C.darkMetal,1,1);
          sideBox(b,side,t,y+.025,dw,.05,.6,.14,C.lightConcrete,0,1);
        }else{
          const ww=step-.48,wh=Math.min(1.75,h-1.8),bottom=.97,top=bottom+wh;
          for(const s of [-1,1]){
            const p=sidePoint(b,side,t+s*(step/2-.12),y+h/2,0);
            solid(`${id}_${side}_pier_${k}_${s}`,...p,horiz?.24:.28,h,horiz?.28:.24,color,0,0);
          }
          for(const [cy,ch]of[[bottom/2,bottom],[(top+h)/2,h-top]]){
            const p=sidePoint(b,side,t,y+cy,0);solid(null,...p,horiz?ww:.28,ch,horiz?.28:ww,color,0,0);
          }
          const p=sidePoint(b,side,t,y+bottom+wh/2,-.07);
          box(...p,horiz?ww:.032,wh,horiz?.032:ww,C.glass,2,1);
          collision(null,...p,horiz?ww:.12,wh,horiz?.12:ww);
          window(b,side,t,y+bottom+wh/2,ww-.12,wh-.08,r,false);
        }
      }
    }
    for(const s of[-1,1])box(x+s*(w/2-.35),y+h-.35,z,.18,.32,d-.6,C.darkMetal,1,1);
    for(let q=-w/2+1.6;q<w/2;q+=3.2){
      box(x+q,y+h-.3,z,1.5,.12,.23,C.cream,6,1,{emissive:.5});
      rod([x+q,y+h-.18,z-d/2+.25],[x+q,y+h-.18,z+d/2-.25],.03,C.rubber,2);
    }
    occupiedPlots.push({id,rect:footprint(x,z,w,d),height:y+h,front:doors[0]?.side||'east',interior:true});
    return b;
  }

  // COILWORKS: an occupied double-height workshop with a genuine entrance and rear work area.
  const workshop=room('coilworks',-32,-11,16,16,0,8.4,C.brick,[{side:'east',offset:0,width:2.7},{side:'south',offset:0,width:2.4}],{floorColor:C.darkConcrete});
  awning(workshop,'east',0,3.0,5.3,rng,'COILWORKS / REPAIR');
  sign('IVO / TOOLS & UPGRADES',-23.74,2.27,-8.0,3.6,.52,Math.PI/2);
  floor('workshop_mezzanine',-39.7,-3.3-5.0,-32,-3.3,4.2,.23,C.darkConcrete);
  rail([-32,-8.3],[-32,-3.3],4.2,.95,true);rail([-39.7,-8.3],[-38.85,-8.3],4.2,.95,true);rail([-36.15,-8.3],[-32,-8.3],4.2,.95,true);
  stairs('workshop_mezzanine_stair',-37.5,-12.8,2.3,8.6,0,4.2,'z',C.darkMetal);
  // Mezzanine stair ends just before its slab; the final landing joins at equal height.
  floor('workshop_mezzanine_landing',-38.7,-8.5,-36.3,-7.8,4.2,.2,C.darkConcrete);
  table(-28.1,0,-7.0,4.8,1.15);solid('workshop_counter',-27.8,.44,-7,4.7,.86,1.0,C.wood,4,1);
  for(let x=-38.6;x<-30;x+=1.75){
    box(x,1.35,-3.65,1.5,2.7,.65,C.darkMetal,1,1);
    for(let k=0;k<4;k++){box(x,.45+k*.58,-3.52,1.48,.07,.83,C.metal,1,2);crate(x,.5+k*.58,-3.45,.65,.4,.42,C.wood,rng);}
  }
  for(const x of[-35,-31]){box(x,2.25,-16.8,2.0,4.5,.25,C.darkMetal,1,1);rod([x,4.2,-17.1],[x,4.2,-9.8],.18,C.rust);}
  box(-33,4.35,-13.8,6.3,.3,.3,C.yellow,1,1);rod([-33,4.2,-13.8],[-33,2.35,-13.8],.05,C.darkMetal);
  hvac(-37,0,-16.5,1.6,1.3);barrel(-26,0,-16.7,C.rust);crate(-29,0,-16.2,1.2,.65,.9,C.wood,rng);
  terminal(-25.7,0,-5.1,'WORKSHOP',Math.PI);
  interact('ivo','npc','Ivo — repair vendor',[-27.4,0,-9.1],{role:'vendor',faction:'cooperative'});
  interact('workshop','shop','Coilworks equipment counter',[-25.7,0,-5.85],{stock:['medkit','battery','field_scanner','signal_decoder','repair_rig','runner_soles','grid_coat'],description:'Repairs, batteries, and working tools. Ivo keeps the ward moving.'});
  location('coilworks','Coilworks',[-30,0,-11],10,0,'An old machine shop maintained by several generations of residents.');
  waterTank(-35,8.4,-7,rng,1.7);hvac(-28,8.4,-15,1.8,1.2);roofEdges(-32,-11,16.2,16.2,8.4,{north:[-34,-30],east:[-8.4,-5.6]});
  // This is the closest façade in the opening view: its second generation has real depth.
  for(const side of['east','south','north','west']){
    const len=16;
    sideBox(workshop,side,0,4.13,len+.1,.22,.42,.16,C.darkConcrete,0,1);
    sideBox(workshop,side,0,7.85,len+.24,.23,.5,.19,C.lightConcrete,0,1);
    for(let j=0;j<5;j++){
      const t=-6.4+j*3.2;
      window(workshop,side,t,5.78,1.85,1.87,rng,j===2);
      if(j%2===0)wallUnit(workshop,side,t+.4,4.76,rng);
      for(let k=0;k<4;k++)sideBox(workshop,side,t+(rng()-.5)*1.5,3.6+rng()*3.9,.15+rng()*.54,.25+rng()*.85,.025,.035,pick([C.rust,tint(C.brick,-.08),tint(C.concrete,-.12)],rng),0,2);
    }
  }
  balcony(workshop,'east',-5.1,4.2,2.8,rng);balcony(workshop,'south',2.1,4.2,2.7,rng);
  awning(workshop,'east',-5.9,2.73,3.0,rng,'PARTS / CALIBRATION');
  sideBox(workshop,'east',-6.8,1.13,.95,1.48,.16,.16,C.metal,1,1);
  for(let i=0;i<7;i++)sideBox(workshop,'east',-6.8,.69+i*.135,.73,.045,.03,.255,C.darkMetal,1,2);
  rod([-23.67,.12,-18.55],[-23.67,8.6,-18.55],.14,C.rust);
  rod([-23.67,8.6,-18.55],[-28.0,8.6,-18.55],.14,C.rust);
  for(let y=.4;y<8.3;y+=1.2)box(-23.64,y,-18.55,.28,.055,.32,C.metal,1,2);
  cable([-23.5,6.8,-16.1],[-20.4,6.8,-17.5],.23,.027,1);

  // HOME: a raised, furnished apartment; the external stair terminates on an open balcony.
  solid('home_ground_store',-34,2,-47,11,4,14,C.darkConcrete,0);
  const home=room('home_room',-34,-47,11,14,4.2,4.2,C.teal,[{side:'east',offset:0,width:2.4}],{floorColor:C.wood});
  stairs('home_stairs',-24.6,-48.3,2.4,14.2,0,4.2,'z');
  floor('home_stair_top',-28.7,-41.2,-23.25,-39.4,4.2,.22,C.darkConcrete);
  floor('home_balcony',-28.7,-49.0,-26.65,-39.4,4.2,.2,C.darkConcrete);
  floor('home_door_landing',-29,-48.7,-26.65,-45.0,4.2,.18,C.darkConcrete);
  // The balcony connects back alongside, never over, the ascending flight.
  rail([-26.59,-49],[-26.59,-41.3],4.2,.9,true);
  sign('HOME / LEVEL 1',-28.34,6.99,-47,2.7,.47,Math.PI/2);
  solid('home_bed',-37.2,4.5,-51.5,2.6,.6,1.5,C.wood,4,1);
  box(-37.2,4.85,-51.5,2.52,.22,1.42,C.cream,5,1);box(-38.0,5.01,-51.5,.5,.19,1.13,C.paleJade,5,2);
  box(-33.7,5.5,-53.3,3.5,2.6,.65,C.wood,4,1);for(let i=0;i<3;i++)box(-34.8+i*1.1,5.47,-52.95,.018,2.2,.05,C.darkMetal,1,2);
  table(-35.2,4.2,-45.5,1.7,.8);box(-35.2,5.0,-45.5,.62,.08,.43,C.darkMetal,1,1);
  box(-38.8,5.3,-43.0,.65,2.2,2.5,C.cream,1,1);cylinder(-38.75,6.45,-42.9,.44,.12,C.metal,1,2);
  bench(-34,4.2,-42.0,Math.PI);plant(-30.1,4.2,-52.5,.4,rng);
  sign('SHIFT NOTES',-38.82,6.1,-47.3,1.5,.75,Math.PI/2);
  interact('home','terminal','Home — rest and save',[-35.1,4.2,-44.4],{description:'Your rented room above an old parts store. Rest, save, and watch the ward wake up.'});
  location('home','Couriers’ rooms',[-34,4.2,-47],8,1,'A small furnished apartment above the freight lane.');
  roofEdges(-34,-47,11.2,14.2,8.4);waterTank(-37,8.4,-50,rng,1.65);plant(-31,8.4,-43,.5,rng);

  // COMMON HANDS: a walk-in clinic with treatment alcoves, a reception counter, and two exits.
  const clinic=room('common_hands',-47,11,14,12,0,8.4,C.lightConcrete,[{side:'east',offset:0,width:2.6},{side:'south',offset:0,width:2.3}]);
  awning(clinic,'east',0,3.0,5.2,rng,'COMMON HANDS / CLINIC');
  sign('SANA / CARE FOR EVERY LEVEL',-39.73,2.1,14.1,3.3,.55,Math.PI/2,C.paleJade);
  solid('clinic_reception',-43.0,.54,14.3,4.2,1.08,1.0,C.cream,0,1);
  for(const z of[7.0,11.0,15.0]){
    solid(`clinic_cot_${z}`,-50.6,.38,z,2.4,.65,1.25,C.metal,1,1);
    box(-50.6,.78,z,2.32,.2,1.20,C.paleJade,5,1);box(-51.3,.96,z,.55,.2,.92,C.cream,5,2);
    box(-53.45,1.6,z,.3,2.8,1.7,C.teal,1,1);
    rod([-49,3.5,z-1.1],[-53.3,3.5,z-1.1],.04,C.metal);
    box(-52.8,2.05,z-1.1,1.0,2.6,.03,C.cream,5,1);
  }
  bench(-45.2,0,6.1,Math.PI);plant(-41,0,16,.38,rng);terminal(-40.9,0,13,'CLINIC DROP',Math.PI/2);
  interact('sana','npc','Sana — clinic medic',[-43.2,0,12.4],{role:'medic',faction:'commons'});
  interact('clinic_drop','container','Clinic supply locker',[-40.8,0,12.0],{description:'A refrigerated locker for time-sensitive clinic deliveries.'});
  location('clinic','Common Hands Clinic',[-47,0,11],9,0,'A community clinic fitted into an old municipal building.');
  roofEdges(-47,11,14.2,12.2,8.4,{east:[5.6,8.4],north:[-53.5,-50.5]});
  for(const x of[-51,-47])hvac(x,8.4,13,1.8,1.4);plant(-43,8.4,14,.45,rng);

  // A continuous roof route links shop, clinic, garden, and market lift.
  walkway('workshop_roof_bridge',-32,-2.9,-32,7,8.4,2.6,{supports:true,gaps:[[-.5,2.5]]});
  walkway('clinic_cross_bridge',-32,7,-40,7,8.4,2.6);
  stairs('clinic_stair_lower',-56,4.5,2.6,11,0,4.2,'z',C.darkConcrete);
  floor('clinic_stair_mid',-57.35,10,-54.65,12,4.2,.23,C.darkConcrete);
  stairs('clinic_stair_upper',-56,17.5,2.6,11,4.2,8.4,'z',C.darkConcrete);
  floor('clinic_stair_top',-57.35,23,-54.65,25.35,8.4,.23,C.darkConcrete);
  walkway('clinic_stair_connector',-56,24,-52,24,8.4,2.6);
  walkway('clinic_north_gallery',-52,24,-52,16.8,8.4,2.6);
  walkway('garden_lower_gallery',-52,24,-34.5,24,8.4,2.6,{supports:true});
  floor('garden_stair_start',-35.85,24,-33.15,26,8.4,.2,C.darkConcrete);
  stairs('garden_stair',-34.5,33,2.6,14,8.4,12.6,'z',C.metal);
  floor('garden_stair_top',-36.25,40,-33.1,42.5,12.6,.2,C.darkConcrete);
  walkway('garden_entry',-34.5,41.2,-37,41.2,12.6,2.6);
  // The garden rests on a real building mass; its roof is a separate traversable slab.
  solid('loom_garden_building',-47,6.18,45,22,12.36,18,C.brick,10);
  floor('loom_garden_roof',-58.1,35.9,-35.9,54.1,12.6,.24,C.darkConcrete);
  const gb={x:-47,z:45,w:22,d:18};
  for(const side of['south','east','west','north'])for(let f=0;f<3;f++)for(let j=0;j<5;j++){
    const len=side==='east'||side==='west'?18:22;
    window(gb,side,-len/2+(j+.5)*len/5,1.8+f*3.9,1.8,1.8,rng,f===1&&j===2);
  }
  roofEdges(-47,45,22.2,18.2,12.6,{east:[39.6,42.8]});
  for(const x of[-54.8,-50.8,-46.8]){
    box(x,12.8,39,2.9,.4,2.0,C.wood,4,1);box(x,13.04,39,2.7,.08,1.8,C.darkConcrete,0,2);
    for(let j=0;j<5;j++)weeds(x-1+j*.5,13.08,39,rng,4);
  }
  waterTank(-54,12.6,49,rng,2.1);waterTank(-50.9,12.6,49.5,rng,1.75);
  for(const x of[-45,-39.5])cylinder(x,14.1,46,.08,3,C.metal,1,1);
  cable([-45,15.1,46],[-39.5,15.1,46],.25,.025,2);
  for(let i=0;i<5;i++)box(-44.5+i*.9,14.45,46,.53,.75,.035,pick([C.cream,C.paleJade,C.red],rng),5,2,{rotation:[0,0,(rng()-.5)*.12]});
  bench(-46.4,12.6,44.8);table(-41,12.6,45.5,1.3,.8);plant(-38,12.6,49,.65,rng);
  terminal(-42,12.6,51,'RELAY 7',Math.PI,C.jade);
  rod([-42,14.3,51],[-42,18.6,51],.1,C.metal);for(let i=0;i<5;i++)rod([-43,17+i*.26,51],[-41,17+i*.26,51],.04,C.metal);
  cable([-42,14.5,51],[-50.7,14,49.4],.4,.07);
  crate(-39,12.6,39.4,1,.75,.8,C.teal,rng);sign('LOOM GARDEN / ROOF COMMONS',-47,14.0,36.06,4.2,.62,Math.PI,C.cream);
  interact('relay','terminal','Rooftop relay 7',[-42,12.6,49.7],{description:'An ageing communications relay keeps the ward connected.'});
  interact('rooftop_drop','container','Roof delivery locker',[-39,12.6,40.5]);
  interact('garden','discovery','Loom Garden',[-47,12.6,44],{description:'Residents turned an abandoned roof into a shared garden.'});
  interact('rescue','npc','Tavi — stranded maintenance worker',[-54,12.6,52],{role:'maintenance',description:'A maintenance worker needs assistance beside the failed water-system junction.'});
  location('roof_commons','Loom Garden',[-47,12.6,45],12,3,'Garden plots, water tanks, washing lines, and a relay overlooking the ward.');

  // Market lift: open structural frame with clear landings at both ends.
  floor('market_lift_ground',-21.45,-.45,-18.55,2.45,0,.18,C.metal,1);
  floor('market_lift_top',-21.45,-.45,-18.55,2.45,8.4,.18,C.metal,1);
  for(const x of[-21.55,-18.45])for(const z of[-.55,2.55])solid(`lift_post_${x}_${z}`,x,5.75,z,.16,11.5,.16,C.darkMetal,1);
  box(-20,11.6,1,3.35,.3,3.35,C.jade,1,1);rod([-21.3,.1,2.4],[-21.3,11.4,2.4],.09,C.rust);
  walkway('market_lift_roof_connection',-20,1,-32,1,8.4,2.6);
  terminal(-18.1,0,2.8,'LIFT / ROOFS',Math.PI/2);terminal(-18.1,8.4,2.8,'LIFT / MARKET',Math.PI/2);
  interact('lift_ground','elevator','Market service lift',[-19.3,0,1],{target:[-20,8.4,1],description:'Lift to the workshop and clinic roof galleries.'});
  interact('lift_roof','elevator','Market service lift — roof',[-19.3,8.4,1],{target:[-20,0,1]});
  ladder(-23.65,-7,0,8.4,'east');sign('ROOF ACCESS',-23.5,2.1,-7,1.2,.42,Math.PI/2);
  // Climb waypoints belong to scripted traversal; foot navigation retains the abstract ladder edge.
  const workshopClimb=[[-22.65,0,-7],[-23.2,0,-7],[-23.2,8.5,-7],[-25.3,8.5,-7],[-25.3,8.4,-7]];
  interact('rooftop_ladder','ladder','Workshop service ladder',[-22.65,0,-7],{target:[-25.3,8.4,-7],travelPath:workshopClimb});
  interact('rooftop_ladder_down','ladder','Workshop ladder — down',[-25.3,8.4,-7],{target:[-22.65,0,-7],travelPath:[...workshopClimb].reverse()});

  // TURNWATER: open street hatch, two continuous stair flights, a chamber, and a second exit.
  stairs('utility_stair_upper',-65,-42,2.8,12,-3.6,0,'z',C.darkConcrete);
  floor('utility_entry_landing',-66.4,-36.2,-63.6,-35.45,0,.2,C.darkConcrete);
  floor('utility_stair_landing',-66.5,-51,-63.5,-48,-3.6,.22,C.darkConcrete);
  stairs('utility_stair_lower',-65,-57,2.8,12,-7.2,-3.6,'z',C.darkConcrete);
  floor('utility_bottom_landing',-66.5,-66,-63.5,-63,-7.2,.24,C.darkConcrete);
  floor('utility_tunnel_floor',-66.5,-66,-33,-60,-7.2,.3,C.darkConcrete);
  floor('utility_chamber_floor',-35,-66,-17,-52,-7.2,.3,C.darkConcrete);
  // Thin slabs above the tunnel/chamber supply a ceiling without filling the rooms.
  floor('utility_tunnel_ceiling',-63.4,-66,-34,-60,-3.25,.28,C.darkConcrete);
  let chamberCeil=[[-35,-66,-17,-52]];
  for(const hole of groundHoles.slice(1))chamberCeil=chamberCeil.flatMap(r=>subtractRect(r,hole));
  chamberCeil.forEach((r,i)=>floor(`utility_chamber_ceiling_${i}`,...[r[0],r[1],r[2],r[3]],-3.25,.25,C.darkConcrete));
  solid('utility_wall_south',-41.8,-5.2,-66.15,49.7,4,.3,C.darkConcrete);
  solid('utility_wall_north',-49.2,-5.2,-59.85,28.4,4,.3,C.darkConcrete);
  solid('utility_chamber_east',-16.85,-5.2,-59,.3,4,14.6,C.darkConcrete);
  solid('utility_chamber_north',-26,-5.2,-51.85,18.6,4,.3,C.darkConcrete);
  solid('utility_chamber_west_north',-35.15,-5.2,-55.85,.3,4,8.0,C.darkConcrete);
  for(const x of[-66.85,-63.15])solid(`utility_well_side_${x}`,x,-1.8,-43.4,.25,3.6,15.4,C.concrete);
  for(const x of[-66.8,-63.2])rail([x,-51.2],[x,-35.5],0,1,true,C.metal);
  rail([-66.8,-51.2],[-63.2,-51.2],0,1,true,C.metal);
  solid('service_entry_left',-66.65,1.55,-35.3,.62,3.1,.55,C.concrete);
  solid('service_entry_right',-63.35,1.55,-35.3,.62,3.1,.55,C.concrete);
  solid('service_entry_lintel',-65,2.89,-35.3,2.72,.42,.55,C.concrete);
  box(-65,1.27,-35.29,2.66,2.54,.13,C.teal,1,1,{owner:'service_door'});
  collision('service_door_collider',-65,1.27,-35.29,2.66,2.54,.13,{type:'door',owner:'service_door'});
  sign('TURNWATER / SERVICE ACCESS',-65,3.15,-34.92,3.0,.46,0,C.yellow);
  interact('service_door','door','Turnwater service door',[-65,0,-34.25],{description:'A municipal access door opens onto the service stairs.'});
  solid('pump_surface_house',-57,2.4,-56,10,4.8,10,C.brick,10);
  waterTank(-57,4.8,-56,rng,3.0);sign('TURNWATER',-57,3.3,-50.83,5.4,.82,0,C.cream);
  for(let x=-61;x<-31;x+=5.8){
    box(x,-3.82,-62.9,1.3,.13,.34,C.cream,6,1,{emissive:.9});
    rod([x,-6.8,-65.4],[x,-3.6,-65.4],.1,C.metal);
    box(x,-5.3,-65.62,.25,2.8,.12,C.rust,1,2);
  }
  for(const y of[-4.3,-4.8])rod([-63,-4.3+(y+4.3),-65.35],[-18,-4.3+(y+4.3),-65.35],.25,C.rust);
  for(let x=-61;x<-17;x+=2.8)cylinder(x,-4.43,-65.35,.36,.1,C.darkMetal,1,2,{rotation:[0,0,Math.PI/2]});
  rod([-28,-4.8,-65.35],[-28,-4.8,-55],.22,C.rust);rod([-28,-4.8,-55],[-28,-6.8,-55],.22,C.rust);
  for(const x of[-31,-27]){
    solid(`pump_machine_${x}`,x,-6.1,-54,2.3,2.2,1.8,C.teal,1,1);
    cylinder(x,-4.89,-54,1.7,.2,C.metal,1,1);
    for(let k=0;k<8;k++)box(x-.9+k*.25,-5.95,-55,0.1,1.6,.035,C.darkMetal,1,2);
  }
  terminal(-27.5,-7.2,-56.2,'PUMP 02',Math.PI,C.jade);
  terminal(-60.6,-7.2,-64.4,'GRID SWITCH',0,C.yellow);
  solid('recovery_cache',-19.3,-6.6,-62.2,1.6,1.2,1.0,C.darkMetal,1,1);box(-19.3,-5.96,-62.2,1.7,.12,1.08,C.yellow,1,1);
  crate(-24,-7.2,-64.5,.9,.7,.8,C.wood,rng);barrel(-32,-7.2,-58.5,C.rust);
  for(let i=0;i<14;i++)box(-58+i*2.3,-7.187,-64.5,.7,.02,.42,tint(C.water,(rng()-.5)*.03),9,2,{roughness:.15});
  ladder(-20,-57,-7.2,0,'north');
  for(const x of[-21.65,-18.35])rail([x,-58.65],[x,-55.35],0,1,true);
  rail([-21.65,-58.65],[-18.35,-58.65],0,1,true);
  sign('UTILITY EXIT',-20,1.7,-58.58,2.6,.44,0,C.yellow);
  const utilityClimb=[[-20,-7.2,-56.2],[-20,-7.2,-56.55],[-20,.1,-56.55],[-20,.1,-54.5],[-20,0,-54.5]];
  interact('service_ladder','ladder','Utility escape ladder',[-20,-7.2,-56.2],{target:[-20,0,-54.5],travelPath:utilityClimb});
  interact('service_ladder_top','ladder','Utility hatch — descend',[-20,0,-54.5],{target:[-20,-7.2,-56.2],travelPath:[...utilityClimb].reverse()});
  interact('pump','terminal','Turnwater pump controller',[-27.5,-7.2,-57.5],{description:'Pressure control for the ward’s recycled-water system.'});
  interact('cache','container','Sealed recovery cache',[-19.3,-7.2,-60.9],{description:'A lost transit container wedged beside the maintenance route.'});
  interact('grid_switch','switch','Service-grid bypass',[-60.6,-7.2,-63.1],{description:'A manual bypass linking the pump and rooftop relay circuits.'});
  location('turnwater','Turnwater service chambers',[-37,-7.2,-62],23,-2,'Pipe galleries, old machinery, a recovery cache, and two routes back to daylight.');

  // SWITCHBACK COURT: purposeful storefronts and market stalls flank a clear, narrow central route.
  box(-7,.023,-2,28,.022,29,tint(C.paving,.045),11,0);
  for(let x=-19;x<7;x+=1.1)box(x,.041,-14.4,.42,.013,.13,C.darkConcrete,11,2);
  function stall(x,z,yaw,label,col){
    const r=random(hash(seed,label,x,z));
    solid(`stall_${label}_${x}`,x,.52,z,2.8,1.04,1.3,C.wood,4,1);
    box(x,1.08,z,3.0,.12,1.5,C.metal,1,1);
    for(const sx of[-1,1])for(const sz of[-1,1])cylinder(x+sx*1.42,1.62,z+sz*.72,.05,3.24,C.metal,1,1);
    box(x,3.1,z,3.5,.1,2.3,col,5,1,{rotation:[.07,0,0]});box(x,2.95,z-1.12,3.5,.3,.045,col,5,1);
    for(let i=0;i<4;i++)box(x-1.28+i*.84,3.14,z,.14,.016,2.2,tint(col,.09),5,2,{rotation:[.07,0,0]});
    sign(label,x,2.52,z+(Math.cos(yaw)>.5?.87:-.87),2.7,.46,yaw);
    for(let i=0;i<7;i++){
      const px=x-1.15+i*.38;crate(px,1.14,z,.31,.18,.52,C.wood,r);
      for(let k=0;k<3;k++)sphere(px+(r()-.5)*.19,1.42,z+(r()-.5)*.37,.14,.13,.14,pick([C.yellow,C.green,C.rust],r),0,2);
    }
    crate(x+1.85,0,z,.72,.5,.65,C.wood,r);litter(x-1.65,0,z+.75,r,4);
  }
  stall(-15.2,-5.2,Math.PI,'THREE KETTLES',C.red);
  stall(-14.8,5.5,Math.PI,'COMMON GOODS',C.teal);
  stall(7.7,-5.5,Math.PI,'EVERYDAY RATIONS',C.cream);
  stall(8.8,6,Math.PI,'ORBIT FRUIT',C.yellow);
  stall(1.0,12.2,Math.PI,'NORTHLINE PARCELS',C.red);
  for(const p of[[-2.2,-1.0],[4.3,3.4],[-11.5,11.4]]){
    cylinder(p[0],1.2,p[1],.07,2.4,C.metal,1,1);
    add('cone',[p[0],2.58,p[1]],[3.3,.65,3.3],pick([C.red,C.teal,C.cream],rng),5,1);
    sphere(p[0],2.91,p[1],.12,.1,.12,C.metal,1,2);
    table(p[0],0,p[1],1.25,.9);
    for(const s of[-1,1]){box(p[0]+s*.9,.48,p[1],.4,.08,.4,C.wood,4,2);for(const ss of[-1,1])box(p[0]+s*.9+ss*.14,.23,p[1],.05,.46,.3,C.metal,1,2);}
  }
  // Broker booth is visible immediately from the starting street perspective.
  box(-18.2,.52,-18.8,3.8,1.04,.65,C.teal,1,1);box(-18.2,2.63,-18.1,4.8,.16,2.8,C.red,5,1);
  box(-18.2,1.08,-18.8,3.95,.10,.8,C.wood,4,1);
  for(let i=0;i<9;i++)box(-19.86+i*.415,.48,-19.14,.09,.85,.06,tint(C.wood,(i%3)*.018),4,2);
  for(const x of[-19.6,-18.8,-16.8])crate(x,1.13,-18.9,.48,.26,.45,C.wood,rng);
  for(const x of[-20.4,-16])cylinder(x,1.3,-16.8,.07,2.6,C.metal,1,1);
  sign('MARA / COURIER CONTRACTS',-18.2,2.03,-16.3,4.4,.54,0,C.cream);
  sign('MARA / COURIER CONTRACTS',-18.2,2.94,-19.05,4.4,.54,Math.PI,C.cream);
  sign('SWITCHBACK WARD',-7.0,5.6,-14.9,7.0,.9,Math.PI,C.cream);
  for(const x of[-10.65,-3.35])rod([x,0,-14.7],[x,6.15,-14.7],.12,C.darkMetal);
  rod([-10.65,6.0,-14.7],[-3.35,6,-14.7],.10,C.rust);
  interact('mara','npc','Mara — courier broker',[-17,0,-17],{role:'broker',faction:'commons',radius:3.2,description:'Mara connects reliable couriers with work throughout the ward.'});
  terminal(-18.6,0,-10.0,'KETTLE / FOOD',Math.PI/2,C.yellow);
  box(-18.6,1.05,-10.0,1.1,2.1,.8,C.red,1,1);sign('HOT FOOD / 08',-18.01,1.68,-10,.7,.5,Math.PI/2,C.yellow,.25);
  interact('kiosk','vending','Three Kettles food kiosk',[-17.2,0,-10],{stock:['snack','medkit'],description:'Hot broth, sealed rations, and the ward’s best tea.'});
  crate(2.2,0,11.6,1.1,.9,.9,C.teal,rng);sign('DELIVERIES',2.2,1.6,11.11,1.4,.42,Math.PI);
  interact('market_drop','container','Market delivery cage',[2.2,0,10.2]);
  location('market','Switchback Court',[-5,0,-1],20,0,'A dense market threaded through the ward’s old pedestrian routes.');
  bench(-12.0,0,16.0);bench(12.8,0,9.0,-Math.PI/2);binCluster(11.0,0,14.5,rng);
  for(const p of[[-20,8],[12,-11],[14,14],[-12,15]])plant(p[0],0,p[1],.4,rng);

  // Older occupied rooms compress the market into a sequence of passages and small courts.
  const kitchen=room('kettle_kitchen',1.9,-7.0,7.2,7.8,0,4.2,C.lightConcrete,[{side:'west',offset:0,width:2.4},{side:'north',offset:0,width:2.4}],{floorColor:C.darkConcrete});
  awning(kitchen,'west',0,2.87,4.9,rng,'SALT & STEAM / KITCHEN');
  sign('HOT BOWLS / TEA / 08',1.9,3.2,-10.99,5.7,.68,Math.PI,C.cream);
  solid('kitchen_counter',3.55,.52,-7,1.05,1.04,4.8,C.wood,4,1);
  for(const z of[-8.8,-7.1,-5.4]){cylinder(3.5,1.2,z,.47,.23,C.metal,1,2);cylinder(3.5,1.37,z,.51,.07,C.darkMetal,1,2);}
  box(4.97,2.4,-7,.65,.55,5.4,C.darkMetal,1,1);rod([4.6,2.7,-9.2],[4.6,6.1,-9.2],.25,C.rust);
  add('cone',[4.6,6.25,-9.2],[.55,.3,.55],C.metal,1,1);
  waterTank(2.0,4.2,-5.6,rng,1.6);hvac(-.2,4.2,-9.2,1.2,.8);
  roofEdges(1.9,-7,7.35,7.95,4.2);plant(4.5,0,-11.5,.38,rng);
  const tailors=room('patch_stitch',-17.0,12.0,4.2,5.5,0,4.2,C.red,[{side:'east',offset:0,width:2.3}],{floorColor:C.wood});
  awning(tailors,'east',0,2.85,4.8,rng,'PATCH / STITCH');
  table(-17.7,0,11.2,1.1,.8);box(-18.3,1.2,14.05,1.1,2.4,.6,C.wood,4,1);
  for(let i=0;i<4;i++)box(-17.8+i*.65,1.2,9.45,.43,1.45,.04,pick([C.cream,C.teal,C.red],rng),5,2);
  barrel(-18,4.2,13,C.teal);plant(-16,4.2,13.5,.32,rng);
  building({id:'market_weighhouse',x:1.8,z:19.1,w:7.6,d:5.2,h:7.2,floorH:3.6,front:'south',color:C.jade});

  // A later timber-and-concrete room sits above the broker's original stall.
  // Its side stair and gallery are fully traversable; the shaded ground-level broker remains clear.
  const brokerRoom=room('courier_rest_room',-18.2,-18.9,4.8,3.3,3.3,3.0,C.paleJade,[{side:'north',offset:0,width:2.3}],{floorColor:C.wood});
  for(const x of[-20.45,-15.95])for(const z of[-20.35,-17.5])solid(`broker_upper_post_${x}_${z}`,x,1.65,z,.12,3.3,.12,C.darkMetal,1,1);
  stairs('broker_side_stair',-16,-22,8.0,2.0,0,3.3,'x',C.darkMetal);
  floor('broker_upper_side_gallery',-12,-23.1,-10.2,-13.8,3.3,.2,C.darkConcrete);
  floor('broker_upper_front_gallery',-20.65,-17.4,-15.7,-13.8,3.3,.2,C.darkConcrete);
  walkway('broker_upper_bridge',-11.1,-15,-18.2,-15,3.3,2.4,{gaps:[[-18.5,-15.4]]});
  rail([-10.15,-23.1],[-10.15,-13.8],3.3,.86,true);
  rail([-20.65,-17.4],[-20.65,-13.8],3.3,.86,true);
  rail([-20.65,-13.8],[-15.7,-13.8],3.3,.86,true);
  table(-18.8,3.3,-19.2,1.15,.6);bench(-19.5,3.3,-17.85,Math.PI/2);
  sign('COURIER CO-OP / REST ROOM',-18.2,5.98,-17.14,4.7,.42,0,C.cream);
  roofEdges(-18.2,-18.9,4.9,3.4,6.3);waterTank(-19.3,6.3,-19.25,rng,1.15);
  rod([-17,6.3,-20.1],[-17,9.3,-20.1],.06,C.metal);
  for(let i=0;i<3;i++)rod([-17.55,8.6+i*.2,-20.1],[-16.45,8.6+i*.2,-20.1],.027,C.metal,2);
  cable([-20.45,6.4,-20.35],[-23.67,6.5,-18.55],.3,.035,1);

  // Eye-level foreground detail belongs to a protected loading apron alongside the narrow start passage.
  floor('opening_loading_apron',-26.2,-23.1,-23.5,-19.15,.16,.16,C.darkConcrete,11);
  rail([-23.45,-23.1],[-23.45,-20.0],.16,.86,true,C.metal);
  crate(-24.95,.16,-19.9,1.0,.78,.8,C.wood,rng);crate(-25.1,.94,-19.9,.73,.47,.65,C.wood,rng);
  binCluster(-25.55,.16,-21.8,rng);barrel(-25.2,.16,-22.6,C.rust);
  box(-24.2,.38,-20.2,.67,.12,1.1,C.metal,1,2);rod([-24.2,.38,-20.7],[-24.2,1.28,-20.7],.065,C.metal);
  for(const s of[-1,1])sphere(-24.2+s*.27,.32,-20.57,.22,.22,.22,C.rubber,1,2);
  // A bicycle leaning against the loading rail, with actual wheel, frame, and handle geometry.
  for(const z of[-22.5,-21.05]){
    add('cylinder',[-23.76,.51,z],[.72,.08,.72],C.rubber,1,2,{rotation:[0,0,Math.PI/2]});
    add('cylinder',[-23.705,.51,z],[.56,.018,.56],C.metal,1,2,{rotation:[0,0,Math.PI/2]});
    for(let k=0;k<4;k++)rod([-23.69,.51-Math.sin(k*Math.PI/4)*.28,z-Math.cos(k*Math.PI/4)*.28],[-23.69,.51+Math.sin(k*Math.PI/4)*.28,z+Math.cos(k*Math.PI/4)*.28],.012,C.darkMetal,2);
  }
  for(const[a,b]of[[[-23.72,.51,-22.5],[-23.72,1.15,-22.1]],[[-23.72,1.15,-22.1],[-23.72,.53,-21.6]],[[-23.72,.53,-21.6],[-23.72,.51,-22.5]],[[-23.72,.53,-21.6],[-23.72,1.07,-21.2]],[[-23.72,1.07,-21.2],[-23.72,.51,-21.05]],[[-23.72,1.07,-21.2],[-23.72,1.15,-22.1]]])rod(a,b,.045,C.rust,2);
  box(-23.72,1.22,-22.1,.22,.07,.36,C.rubber,1,2);rod([-23.96,1.22,-21.22],[-23.48,1.22,-21.22],.04,C.metal,2);
  box(-21.95,.045,-21.6,2.85,.02,5.7,[.19,.22,.215],3,1);
  for(let i=0;i<18;i++){
    const r=random(hash(seed,'opening_wear',i)),x=-23.1+r()*2.35,z=-24+r()*5.2;
    box(x,.061,z,.13+r()*.6,.012,.12+r()*.7,tint(C.darkConcrete,(r()-.5)*.07),3,2,{rotation:[0,r()*.35,0]});
    if(i%2===0)rod([x,.079,z],[x+.18+r()*.25,.079,z+.35+r()*.45],.016,C.rubber,2);
  }
  litter(-23.1,0,-19.2,rng,12);litter(-22.9,0,-23.3,rng,7);
  weeds(-23.62,.16,-19.3,rng,11);weeds(-23.5,0,-24.0,rng,7);
  box(-23.26,.034,-19.2,.42,.025,1.45,C.water,9,2,{roughness:.16});

  // SCALES EXCHANGE: accessible union hall and archive, with useful commercial depth.
  const exchange=room('scales_exchange',29,34,16,17,0,12.6,C.teal,[{side:'west',offset:-2,width:2.8},{side:'east',offset:-2,width:2.5}]);
  awning(exchange,'west',-2,3.2,5.8,rng,'SCALES / UNION EXCHANGE');
  sign('ORIN / PUBLIC DESK',21.21,2.3,29.0,3.0,.51,-Math.PI/2);
  solid('union_desk',27,.5,30.5,4.7,1.0,1.2,C.wood,4,1);bench(24,0,37.5,Math.PI/2);
  for(const x of[31,33.5,36]){solid(`archive_rack_${x}`,x,1.8,40.2,1.6,3.6,1.0,C.darkMetal,1,1);for(let k=0;k<5;k++)box(x,.5+k*.62,39.67,1.28,.22,.05,C.metal,1,2);}
  terminal(34.5,0,37.5,'CIVIC ARCHIVE',Math.PI,C.jade);
  for(const z of[35,38])rod([29,0,z],[29,3.2,z],.08,C.metal);
  for(let y=.3;y<3.2;y+=.3)rod([29,y,35],[29,y,38],.025,C.metal,2);
  sign('ARCHIVE / AUTHORISED ACCESS',29.1,2.75,36.5,2.6,.44,Math.PI/2,C.yellow);
  interact('orin','npc','Orin — union representative',[27.2,0,32.1],{role:'union',faction:'commons'});
  interact('archive','terminal','Restricted civic archive',[34.5,0,36.2],{description:'Historical records of the ward’s water and communications contracts.'});
  location('exchange','Scales Exchange',[29,0,34],12,0,'A union hall and cooperative archive built inside an older commercial block.');
  waterTank(25,12.6,39,rng,1.8);hvac(34,12.6,29,2,1.7);

  // SILT YARD and EAST FOUNDRY: receiving areas have carts, tools, loading bays, and parking.
  const yard=room('silt_yard',64,-43,18,23,0,7.2,C.darkConcrete,[{side:'north',offset:0,width:3.1},{side:'west',offset:5,width:2.6}],{floorColor:C.darkConcrete});
  sign('SILT YARD / RECLAIM & RIDE',64,5.8,-31.34,8.0,.9,0,C.yellow);
  for(let x=58;x<=69;x+=3.8){crate(x,0,-52,2.1,1.3,1.6,C.wood,rng);crate(x+.15,1.3,-52,1.7,1.05,1.45,C.wood,rng);}
  for(const z of[-44,-39]){solid(`yard_rack_${z}`,70.8,1.65,z,2.6,3.3,2.4,C.darkMetal,1,1);for(let k=0;k<3;k++)box(70.8,.6+k, z,2.7,.12,2.6,C.metal,1,1);}
  rod([57,5.5,-49],[57,5.5,-36],.2,C.rust);rod([57,5.5,-40],[65,5.5,-40],.2,C.rust);
  location('works','Silt Yard',[63,0,-42],13,0,'A salvage and vehicle workshop opening onto the freight route.');
  const foundry=room('east_foundry',65,43,18,21,0,8.4,C.brick,[{side:'west',offset:0,width:3}],{floorColor:C.darkConcrete});
  awning(foundry,'west',0,3.2,5.6,rng,'EAST FOUNDRY / LOADING');
  for(const x of[60,65,70]){hvac(x,0,49,1.8,2.1);rod([x,1.2,49],[x,7.6,49],.22,C.rust);}
  for(const z of[37,41,45])crate(72,0,z,1.6,.85,1.5,C.wood,rng);
  sign('LIFTING ZONE',57.6,2.4,43,2.3,.46,-Math.PI/2,C.yellow);
  location('foundry','East Foundry',[65,0,43],12,0,'A working industrial yard under the viaduct.');

  // Public transport deck: stairs finish before the platform so its floor cannot block the climb.
  floor('station_platform',.5,51.8,25.5,59.3,8.4,.42,C.lightConcrete);
  stairs('station_stairs',8,38,2.8,24,0,8.4,'z',C.concrete);
  floor('station_stair_landing',6.5,50,9.5,52.2,8.4,.25,C.lightConcrete);
  rail([.5,51.8],[6.4,51.8],8.4,1,true);rail([9.6,51.8],[25.5,51.8],8.4,1,true);
  rail([.5,51.8],[.5,59.3],8.4,1,true);rail([25.5,51.8],[25.5,59.3],8.4,1,true);
  for(const x of[2,12.5,23]){
    for(const z of[52.6,58.1])solid(`station_column_${x}_${z}`,x,6.2,z,.4,12.4,.4,C.darkConcrete);
    box(x,12.0,55.4,.2,.24,9.6,C.metal,1,1);
  }
  box(13,12.2,55.5,27,.23,10.5,C.jade,1,0);box(13,12.43,53.2,27,.15,4.7,C.paleJade,1,1,{rotation:[.065,0,0]});
  sign('NORTHLINE / SWITCHBACK',13,11.3,51.63,10.5,.86,Math.PI,C.cream);
  sign('PLATFORM 2 / ROOF COMMONS',13,10.05,58.3,6.6,.52,Math.PI,C.cream);
  bench(18.4,8.4,53.6);bench(4,8.4,54.7,Math.PI/2);terminal(12.4,8.4,55.8,'NORTHLINE',Math.PI,C.jade);
  for(let x=-82;x<84;x+=11.5){
    // Paired piers leave road crossings and the station stair corridor clear.
    if(Math.abs(x-2)<6||Math.abs(x-48)<5||x>1&&x<26)continue;
    for(const z of[59.6,62.4])solid(`rail_pier_${x}_${z}`,x,3.75,z,.55,7.5,.65,C.darkConcrete);
    box(x,7.1,61,1.5,.6,5.4,C.concrete,0,0);
  }
  floor('viaduct_deck',-86,58.8,86,63.2,7.65,.44,C.darkConcrete);
  for(const z of[60.2,61.8])box(0,7.98,z,172,.14,.12,C.metal,1,0);
  for(let x=-84;x<85;x+=.85)box(x,7.8,61,.16,.1,2.9,C.wood,4,1);
  for(const z of[58.85,63.15]){rail([-85,z],[85,z],7.65,.8,false,C.darkMetal);box(0,7.27,z,172,.22,.24,C.concrete,0,1);}
  for(let x=-76;x<85;x+=17){
    const z=63.6;rod([x,7.65,z],[x,13.1,z],.13,C.metal);rod([x,12.8,z],[x,12.8,60.4],.08,C.metal);
    if(x<76)cable([x,12.75,60.6],[x+17,12.75,60.6],.18,.035,1);
  }
  const transitStops=[{name:'Switchback Market',position:[4,0,1.6]},{name:'Silt Yard',position:[62,0,-27.4]},{name:'Northline Roof Station',position:[13,8.4,57]}];
  interact('transit_market','transit','Switchback Market stop',[4,0,1.6],{destinations:transitStops});
  interact('transit_works','transit','Silt Yard stop',[62,0,-27.4],{destinations:transitStops});
  interact('transit_roof','transit','Northline platform',[13,8.4,57],{destinations:transitStops});
  for(const [x,z]of[[4,1.6],[62,-27.4]]){terminal(x+.95,0,z,'NORTHLINE STOP',Math.PI,C.jade);rod([x+.9,0,z],[x+.9,3.4,z],.08,C.metal);sign('NORTHLINE',x+.9,3.05,z,1.55,.49,Math.PI,C.cream);}
  location('northline','Northline Station',[13,8.4,56],16,2,'An elevated station laid over the old streets, with a real stair route to the market.');

  // Memorable civic pocket, deliberately outside the mission spine.
  floor('memorial_paving',-17,26,-11,32,.04,.1,C.lightConcrete,11);
  solid('memorial_stone',-14,1.1,30.5,1.8,2.2,.65,C.darkConcrete);
  sign('THE WARD REMEMBERS',-14,1.43,30.09,1.6,.54,Math.PI,C.cream);
  for(let i=0;i<7;i++)cylinder(-15.2+i*.36,.18,29.8,.09,.24,C.cream,0,2);
  bench(-16.1,0,28.4,Math.PI/2);plant(-11.8,0,30.8,.45,rng);
  interact('memorial','discovery','The ward remembers',[-14,0,28.8],{description:'Names of workers lost when the old water main failed. Fresh offerings show they are remembered.'});
  location('memorial','Workers’ memorial',[-14,0,29],4,0,'A cared-for corner between the market and the northern passages.');

  // A rideable courier scooter is a physical asset, distinct from Population traffic.
  const scooterX=1.3,scooterZ=-18.5;
  for(const z of[scooterZ-.62,scooterZ+.65]){
    add('cylinder',[scooterX,.29,z],[.53,.13,.53],C.rubber,1,1,{rotation:[0,0,Math.PI/2]});
    add('cylinder',[scooterX+.075,.29,z],[.29,.025,.29],C.metal,1,2,{rotation:[0,0,Math.PI/2]});
  }
  box(scooterX,.4,scooterZ,.35,.15,1.13,C.teal,1,1);box(scooterX,.92,scooterZ+.25,.42,.17,.65,C.rubber,1,1);
  rod([scooterX,.35,scooterZ+.18],[scooterX,.89,scooterZ+.18],.1,C.metal);rod([scooterX,.35,scooterZ-.6],[scooterX,1.24,scooterZ-.48],.11,C.teal);
  rod([scooterX-.35,1.24,scooterZ-.48],[scooterX+.35,1.24,scooterZ-.48],.075,C.darkMetal);
  crate(scooterX,.67,scooterZ+.76,.56,.42,.45,C.yellow,rng);
  interact('scooter','vehicle','Courier scooter',[scooterX+.9,0,scooterZ],{description:'A compact electric courier scooter with a rear delivery crate.'});

  // Infill follows the reserved route graph. Local dimensions and rooflines vary per parcel.
  function blockedPlot(rect){
    if(fixedRects.some(q=>intersects(rect,q)))return true;
    const samples=[[rect[0],rect[1]],[rect[2],rect[1]],[rect[0],rect[3]],[rect[2],rect[3]],[(rect[0]+rect[2])/2,(rect[1]+rect[3])/2]];
    if(samples.some(p=>onRoad(p[0],p[1],1.3)))return true;
    for(const path of footWays)for(let j=1;j<path.length;j++)if(samples.some(p=>distSegment(p[0],p[1],path[j-1],path[j])<1.7))return true;
    return occupiedPlots.some(b=>intersects(rect,b.rect,1.3));
  }
  const regions=[[-82,-70,-44,-31],[-43,-70,-8,-33],[9,-70,43,-32],[56,-70,82,-30],[-82,-20,-42,20],[-40,-1,-25,20],[20,-17,44,20],[57,-16,82,20],[-82,30,-39,70],[-33,30,-12,70],[11,29,44,70],[56,30,82,70]];
  let parcel=0;const tallRegions=new Set();
  for(let ri=0;ri<regions.length;ri++){
    const reg=regions[ri],r=random(hash(seed,'plots',ri));
    for(let z=reg[1]+.6;z<reg[3]-6;){
      const rowD=Math.min(9.2+r()*4,reg[3]-z-.3);if(rowD<6)break;
      for(let x=reg[0]+.5;x<reg[2]-6;){
        const w=Math.min(7.0+r()*5,reg[2]-x-.3),d=rowD-(r()<.28?1.0:0);if(w<5.8)break;
        const rect=[x,z,x+w,z+d];
        if(!blockedPlot(rect)){
          const cx=x+w/2,cz=z+d/2,front=Math.abs(cx)>35?(cx<0?'east':'west'):(cz<0?'north':'south');
          const floorH=pick([3,3.3,3.6],r),floors=3+Math.floor(r()*4);
          const makeTall=[4,7,8].includes(ri)&&!tallRegions.has(ri)&&w>8.2;
          if(makeTall)tallRegions.add(ri);
          const h=makeTall?(14+ri%3)*floorH:floors*floorH;
          building({id:`parcel_${parcel++}`,x:cx,z:cz,w,d,h,floorH,front,color:pick([C.concrete,C.lightConcrete,C.brick,C.teal,C.jade,C.red],r)});
        }
        x+=w+2.7+r()*1.3;
      }
      z+=rowD+2.8+r()*1.1;
    }
  }
  // Several narrow taller masses grow from old podiums and remain geographically close.
  const towers=[
    {id:'needle_house',x:29,z:58,w:12,d:14,h:72,floorH:3.3,front:'west',color:C.jade},
    {id:'west_spindle',x:-74,z:8,w:12,d:13,h:58,floorH:3.3,front:'east',color:C.concrete},
    {id:'north_old_tower',x:-69,z:62,w:12,d:12,h:66,floorH:3.6,front:'south',color:C.teal},
    {id:'eastern_stack',x:76,z:6,w:11,d:13,h:80,floorH:3.6,front:'west',color:C.jade},
    {id:'south_east_core',x:34,z:-62,w:11,d:13,h:54,floorH:3.3,front:'west',color:C.brick},
  ];
  // Towers replace only unused reserved pockets; never intersect an existing occupied parcel.
  for(const t of towers){
    if(t.id!=='needle_house'&&(intersects(footprint(t.x,t.z,t.w,t.d),[-86,58.2,86,63.8])||occupiedPlots.some(p=>intersects(footprint(t.x,t.z,t.w,t.d),p.rect,.5))))continue;
    building(t);
    const p=sidePoint(t,t.front,0,0,1.5),tp=[t.x+t.w*.30,t.h,t.z-t.d*.28];
    terminal(p[0],0,p[2],t.id==='needle_house'?'NEEDLE HOUSE':'TOWER SERVICE',sideYaw(t.front));
    interact(`${t.id}_lift`,'elevator',`${t.id==='needle_house'?'Needle House':'Service tower'} lift`,[p[0],0,p[2]],{target:tp,description:'A service lift leads to the tower maintenance roof.'});
    interact(`${t.id}_lift_roof`,'elevator','Tower lift — street',tp,{target:[p[0],0,p[2]]});
    if(t.id==='needle_house')location('needle_house','Needle House',[29,0,58],12,0,'A narrow jade tower rising from the ward’s older masonry base.');
  }

  // Utility spines connect shops, mains, and overhead networks; no decorative dead-end cables.
  const polePoints=[[-22,-29],[-21,-1],[-20,22],[-4,42],[17,-20],[41,-27],[56,5],[44.6,39],[27,48],[-61,-29],[-59,23],[-36,27]];
  polePoints.forEach(([x,z],i)=>{
    solid(`utility_pole_${i}`,x,3.4,z,.14,6.8,.14,C.darkMetal,1,1);
    box(x,3.15,z,.46,.67,.27,C.metal,1,1);box(x,3.23,z+.15,.15,.13,.035,C.yellow,1,2);
    rod([x-.7,6.4,z],[x+.7,6.4,z],.08,C.metal);
    for(const sx of[-.45,.45])cylinder(x+sx,6.6,z,.11,.32,C.cream,0,2);
    box(x,5.95,z-.4,.4,.13,.72,C.cream,6,1,{emissive:.55,rotation:[-.2,0,0]});
  });
  for(const[a,b]of[[0,1],[1,2],[2,3],[0,4],[4,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,2]]){
    for(const offset of[-.45,.45])cable([polePoints[a][0]+offset,6.6,polePoints[a][1]],[polePoints[b][0]+offset,6.6,polePoints[b][1]],.6,.032,1);
  }
  cable([-21,6.4,-1],[-24,6.8,-3],.25,.04);cable([-59,6.4,23],[-54,7.8,17],.4,.04);
  cable([-20,6.4,22],[-21,3.5,32],.5,.04);cable([27,6.4,48],[23,8.4,52],.3,.04);
  rod([-23.82,.3,-18],[-23.82,7.9,-18],.11,C.rust);rod([-23.82,7.9,-18],[-28,7.9,-18],.11,C.rust);
  for(let y=.9;y<7.9;y+=1.1)box(-23.77,y,-18,.24,.045,.24,C.metal,1,2);
  // Street furniture and traffic logistics are concentrated at addresses and decisions.
  for(const p of[[-42,-29],[-59,-27],[36,-19],[56,-28],[43,28],[-60,26],[20,46]]){
    const r=random(hash(seed,'receiving',p));crate(p[0],0,p[1],.9,.65,.8,C.wood,r);crate(p[0]+.4,.65,p[1],.6,.45,.6,C.wood,r);
    box(p[0]+1.2,.24,p[1]+.25,.7,.12,1.2,C.metal,1,2);rod([p[0]+1.2,.28,p[1]+.8],[p[0]+1.2,1.1,p[1]+.8],.07,C.metal);
    for(const s of[-1,1])sphere(p[0]+1.2+s*.3,.17,p[1]+.63,.2,.2,.2,C.rubber,1,2);
    litter(p[0]-.6,0,p[1]+.3,r,7);
  }
  for(const p of[[-61,-34],[-23,-35],[40,-29],[56,18],[-27,25],[17,22],[-60,31],[13,-18]]){
    const r=random(hash(seed,'service-grime',p));binCluster(p[0],0,p[1],r);barrel(p[0]+1.7,0,p[1]-.1,C.rust);
  }
  for(const p of[[-2,-40],[1,-58],[-11,5],[3,33],[45,-45],[51,9],[49,52],[-44,-26],[-70,-26]]){
    if(holeAt(p[0],p[1],1))continue;
    cylinder(p[0],.034,p[1],.95,.045,C.darkMetal,1,1);cylinder(p[0],.061,p[1],.81,.014,C.metal,1,2);
    for(let k=0;k<5;k++)box(p[0],.072,p[1]-.29+k*.14,.61,.012,.035,C.darkMetal,1,2);
    for(let k=0;k<3;k++)box(p[0]+.7+k*.25,.025,p[1]+.4,.03,.022,.9,C.darkConcrete,3,2,{rotation:[0,-.4,0]});
  }
  // Twenty-first-century hardware with discreet futuristic retrofits.
  for(const[x,z]of[[-19,-13],[58,-30],[20,28],[-40,18]]){
    box(x,.16,z,1.1,.32,.7,C.darkConcrete,1,1);box(x,.52,z,.65,.4,.45,C.cream,1,1);
    box(x,.75,z+.23,.29,.13,.03,C.jade,6,2,{emissive:.7});rod([x,.25,z],[x+.8,.2,z+.3],.045,C.rubber,2);
    sign('AUTONOMOUS PARCEL BAY',x,1.5,z-.5,1.65,.38,Math.PI,C.cream);
  }

  // The ward ends at visible infrastructure: retaining walls, flood channels, and fenced service gates.
  // All boundary solids are outside the playable bounds; streets remain connected within them.
  for(const z of[-74.15,74.15]){
    for(const[a,b]of[[-87,-5],[6,42],[54,87]])solid(`boundary_${z}_${a}`,(a+b)/2,1.2,z,b-a,2.4,.45,C.darkConcrete);
    for(const[x,label]of[[.5,'WARD SERVICE GATE'],[48,'NORTHLINE WORKS']]){
      solid(`gate_left_${x}_${z}`,x-5.2,2.5,z,.5,5,.65,C.concrete);
      solid(`gate_right_${x}_${z}`,x+5.2,2.5,z,.5,5,.65,C.concrete);
      box(x,4.9,z,10.8,.5,.7,C.rust,1,0);
      sign(label,x,4.55,z+(z<0?.39:-.39),8,.7,z<0?0:Math.PI,C.cream);
      for(let k=-10;k<=10;k++)solid(`gate_bar_${x}_${z}_${k}`,x+k*.5,.95,z,.065,1.9,.08,C.darkMetal,1,1);
      rod([x-5,1.85,z],[x+5,1.85,z],.085,C.darkMetal);
    }
  }
  for(const side of[-1,1]){
    const x=side*86;
    for(const[a,b]of[[-74,-31],[-21,74]])solid(`retaining_${side}_${a}`,x,1.2,(a+b)/2,.6,2.4,b-a,C.darkConcrete);
    solid(`freight_end_${side}`,x,1.1,-26,.16,2.2,9.4,C.metal,1,1);
    sign(side<0?'LOWER WARD / FREIGHT':'EAST WATER CHANNEL',x-side*.35,3.0,-26,7.1,.66,side<0?Math.PI/2:-Math.PI/2,C.cream);
  }
  floor('east_canal_bed',87,-77,94,77,-2.4,.4,C.darkConcrete);
  box(90.5,-1.62,0,6.8,.045,153,C.water,9,0,{roughness:.2});
  solid('east_canal_outer_wall',94.2,-.4,0,.45,4,154,C.darkConcrete);
  for(let z=-69;z<=70;z+=11.3){rod([87.1,0,z],[89.0,-.9,z],.25,C.rust);weeds(85.25,0,z,rng,5);}

  // Ground navigation is generated against real colliders, so inhabitants follow usable streets and passages.
  const groundSolids=colliders.filter(c=>c.type!=='door'&&c.min[1]<1.75&&c.max[1]>.28);
  const groundClear=(x,z,r=.36)=>!holeAt(x,z,r+.15)&&!groundSolids.some(c=>x>c.min[0]-r&&x<c.max[0]+r&&z>c.min[2]-r&&z<c.max[2]+r);
  const gridStep=3.0,grid=new Map();
  for(let iz=0,z=-70.5;z<=70.5;iz++,z+=gridStep)for(let ix=0,x=-82.5;x<=82.5;ix++,x+=gridStep){
    if(!groundClear(x,z))continue;
    // Thin out remote back corners but keep entrances and every major district route.
    const id=`foot_${ix}_${iz}`;node(id,[x,0,z]);grid.set(`${ix},${iz}`,id);
  }
  const groundVoids=groundHoles.map(h=>({min:[h[0],0,h[1]],max:[h[2],0,h[3]]}));
  function clearLine(a,b,y=0,r=.35){
    return !groundVoids.some(h=>segmentIntersectsFootprint(a,b,h.min,h.max,r+.15)) &&
      !groundSolids.some(c=>segmentIntersectsFootprint(a,b,c.min,c.max,r));
  }
  for(const[key,id]of grid){
    const[ix,iz]=key.split(',').map(Number);
    for(const[dx,dz]of[[1,0],[0,1],[1,1],[-1,1]]){
      const other=grid.get(`${ix+dx},${iz+dz}`);if(other&&clearLine(nodeIndex.get(id).position,nodeIndex.get(other).position))edge(id,other);
    }
  }
  function nearestGround(p,max=14){
    let best=null,dist=max;
    for(const n of navNodes){if(n.kind!=='foot'||Math.abs(n.position[1])>.1||!n.id.startsWith('foot_'))continue;const d=Math.hypot(p[0]-n.position[0],p[2]-n.position[2]);if(d<dist&&clearLine(p,n.position)){best=n.id;dist=d;}}
    return best;
  }
  // Explicit layered graph routes mirror the ramps and bridge geometry.
  const route=(name,points,groundEnds=false)=>{
    let prev;const ids=[];
    points.forEach((p,i)=>{const id=node(`${name}_${i}`,p);ids.push(id);if(prev)edge(prev,id);prev=id;});
    if(groundEnds){for(const i of[0,ids.length-1])if(Math.abs(points[i][1])<.1){const n=nearestGround(points[i]);if(n)edge(ids[i],n);}}
    routePaths.push({id:name,points:points.map(p=>[...p]),mode:name.includes('lift')?'elevator':name.includes('ladder')?'ladder':'walk',
      segments:points.slice(1).map((p,i)=>({from:i,to:i+1,mode:Math.abs(p[1]-points[i][1])>Math.hypot(p[0]-points[i][0],p[2]-points[i][2])*.8?(name.includes('lift')?'elevator':'ladder'):'walk'}))});
    return ids;
  };
  const homeRoute=route('home_route',[[-24.6,0,-56.3],[-24.6,0,-55.4],[-24.6,2.1,-48.3],[-24.6,4.2,-41.2],[-24.6,4.2,-40.2],[-27.6,4.2,-40.2],[-27.6,4.2,-47],[-30.5,4.2,-47],[-35.1,4.2,-44.4]],true);
  const roofRoute=route('roof_route',[[-56,0,-2],[-56,0,-1],[-56,2.1,4.5],[-56,4.2,10],[-56,4.2,12],[-56,6.3,17.5],[-56,8.4,23],[-56,8.4,24],[-52,8.4,24],[-52,8.4,16],[-47,8.4,7],[-40,8.4,7],[-32,8.4,7],[-32,8.4,1],[-32,8.4,-2],[-30,8.4,-7]],true);
  const gardenRoute=route('garden_route',[[-52,8.4,24],[-43,8.4,24],[-34.5,8.4,24],[-34.5,8.4,26],[-34.5,10.5,33],[-34.5,12.6,40],[-34.5,12.6,41.2],[-37.5,12.6,41.2],[-47,12.6,44],[-42,12.6,49.7]],false);
  edge(roofRoute[8],gardenRoute[0]);
  const rescueRoute=route('rescue_route',[[-47,12.6,44],[-55.5,12.6,44],[-56.5,12.6,49],[-54,12.6,52]],false);edge(rescueRoute[0],gardenRoute[8]);
  const liftRoute=route('lift_route',[[-19.3,0,1],[-20,8.4,1],[-25,8.4,1],[-32,8.4,1]],true);edge(liftRoute[3],roofRoute[13]);
  const ladderRoute=route('roof_ladder_route',[[-22.65,0,-7],[-25.3,8.4,-7],[-30,8.4,-7]],true);edge(ladderRoute[2],roofRoute[15]);
  const underRoute=route('utility_route',[[-65,0,-33.5],[-65,0,-35.8],[-65,0,-36],[-65,-1.8,-42],[-65,-3.6,-48],[-65,-3.6,-51],[-65,-5.4,-57],[-65,-7.2,-63],[-65,-7.2,-64],[-60.6,-7.2,-63.1],[-50,-7.2,-63],[-39,-7.2,-63],[-31,-7.2,-62],[-27.5,-7.2,-57.5],[-20,-7.2,-56.2],[-20,0,-54.5]],true);
  const cacheRoute=route('cache_route',[[-31,-7.2,-62],[-23,-7.2,-61],[-19.3,-7.2,-60.9]],false);edge(cacheRoute[0],underRoute[12]);
  const stationRoute=route('station_route',[[8,0,25],[8,0,26],[8,2.1,32],[8,4.2,38],[8,6.3,44],[8,8.4,50],[8,8.4,53.5],[13,8.4,57]],true);
  route('workshop_mezz_route',[[-37.5,0,-17.6],[-37.5,0,-17.1],[-37.5,2.1,-12.8],[-37.5,4.2,-8.5],[-37.5,4.2,-8.1],[-35,4.2,-6]],true);
  route('broker_upper_route',[[-20.7,0,-22],[-20,0,-22],[-16,1.65,-22],[-12,3.3,-22],[-11.1,3.3,-22],[-11.1,3.3,-15],[-17,3.3,-15],[-17,3.3,-18.5]],true);
  // Authored interaction nodes are grounded in their actual room or access network.
  const specialNodes=[];
  for(const target of interactables){
    if(target.type==='transit'&&target.id==='transit_roof')continue;
    const id=node(`target_${target.id}`,[...target.position]);specialNodes.push(id);
    if(Math.abs(target.position[1])<.1){const n=nearestGround(target.position,20);if(n)edge(id,n);}
    else{
      let best=null,distance=10;
      for(const n of navNodes){
        if(n.id===id||n.kind!=='foot'||n.id.startsWith('target_'))continue;
        const dy=Math.abs(n.position[1]-target.position[1]);if(dy>.5)continue;
        const d=Math.hypot(n.position[0]-target.position[0],n.position[2]-target.position[2]);if(d<distance){best=n.id;distance=d;}
      }
      if(best)edge(id,best);
    }
  }
  node('target_transit_roof',[13,8.4,57]);edge('target_transit_roof',stationRoute[7]);
  for(const target of interactables){
    if(!target.target)continue;
    let best=null,distance=2.0;
    for(const other of interactables){if(other.id===target.id)continue;const d=Math.hypot(...other.position.map((v,i)=>v-target.target[i]));if(d<distance){distance=d;best=other.id;}}
    if(best)edge(`target_${target.id}`,`target_${best}`);
  }
  // Long-range abstraction graph for autonomous drones, kept separate from walking navigation.
  const airRoute=[];
  const flightClearance=2.2;
  const clearAirLink=(aId,bId)=>{
    const a=nodeIndex.get(aId).position,b=nodeIndex.get(bId).position;
    let cruiseY=Math.max(a[1],b[1]),needsClearance=false;
    for(const c of colliders)if(segmentIntersectsFootprint(a,b,c.min,c.max,1.0)&&c.max[1]+flightClearance>Math.min(a[1],b[1])){cruiseY=Math.max(cruiseY,c.max[1]+flightClearance);needsClearance=true;}
    if(!needsClearance){edge(aId,bId);return;}
    // Rise outside the facade, cross above the obstruction, then descend.
    // Keeping the bend points explicit prevents drones interpolating through towers.
    const highA=Math.abs(a[1]-cruiseY)<.001?aId:node(`${aId}_${bId}_clear_a`,[a[0],cruiseY,a[2]],'air');
    const highB=Math.abs(b[1]-cruiseY)<.001?bId:node(`${aId}_${bId}_clear_b`,[b[0],cruiseY,b[2]],'air');
    edge(aId,highA);edge(highA,highB);edge(highB,bId);
  };
  for(let iz=0;iz<4;iz++)for(let ix=0;ix<5;ix++){
    const p=[-67+ix*33,28+(ix%2)*6,-55+iz*36];
    for(const c of colliders)if(segmentIntersectsFootprint(p,p,c.min,c.max,1.0))p[1]=Math.max(p[1],c.max[1]+flightClearance);
    const id=node(`air_${ix}_${iz}`,p,'air');airRoute.push(id);
    if(ix)clearAirLink(id,`air_${ix-1}_${iz}`);if(iz)clearAirLink(id,`air_${ix}_${iz-1}`);
  }

  return {
    seed, name: 'Switchback Ward', instances, colliders, ramps, interactables, locations, navNodes, navEdges, roads,
    spawn: { position: [-21.8,0,-22.35], yaw: Math.PI - .06, pitch: -0.025 }, bounds, cells, signs,
    tramRoute:{points:[[-82,8.4,61],[82,8.4,61]],stops:[[13,8.4,61],[-72,8.4,61],[72,8.4,61]]},
    routeMetadata:{paths:routePaths,undergroundOpenings:groundHoles,levels:[-7.2,-3.6,0,3.3,4.2,8.4,12.6],
      interiors:[{id:'workshop',door:[-24,0,-11],level:0},{id:'home',door:[-28.5,4.2,-47],level:4.2},{id:'clinic',door:[-40,0,12.5],level:0},{id:'archive',door:[21,0,32.58],level:0}],
      rail:{trackY:8,boardingY:8.4,z:61,underpass:{building:'needle_house',min:[23,6.8,58],max:[35,14,64.3]}}},
  };
}
