// Meshes share position.xyz / normal.xyz / uv.xy, with outward CCW winding.
// Primitive dimensions match the world contract. UV v=0 is the top of a sign.
export const MESH_NAMES = ['box', 'cylinder', 'sphere', 'cone', 'quad'];

function mesh(vertices, indices) {
  const edges = [];
  const seen = new Set();
  for (let i = 0; i < indices.length; i += 3) {
    for (const [a, b] of [[indices[i], indices[i + 1]], [indices[i + 1], indices[i + 2]], [indices[i + 2], indices[i]]]) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push(a, b);
      }
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices), edges: new Uint16Array(edges), triangles: indices.length / 3 };
}

function box() {
  const vertices = [], indices = [];
  // Each local face basis (u,v) has cross(u,v) == normal.
  const faces = [
    [[0, 0, 0.5], [1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [[0, 0, -0.5], [-1, 0, 0], [0, 1, 0], [0, 0, -1]],
    [[0.5, 0, 0], [0, 0, -1], [0, 1, 0], [1, 0, 0]],
    [[-0.5, 0, 0], [0, 0, 1], [0, 1, 0], [-1, 0, 0]],
    [[0, 0.5, 0], [1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[0, -0.5, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0]],
  ];
  for (const [center, u, v, normal] of faces) {
    const base = vertices.length / 8;
    for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      vertices.push(center[0] + x * u[0] + y * v[0], center[1] + x * u[1] + y * v[1], center[2] + x * u[2] + y * v[2],
        ...normal, x + 0.5, 0.5 - y);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return mesh(vertices, indices);
}

function cylinder(segments = 16) {
  const vertices = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const angle = i * Math.PI * 2 / segments, x = Math.cos(angle), z = Math.sin(angle);
    vertices.push(x * 0.5, -0.5, z * 0.5, x, 0, z, i / segments, 1);
    vertices.push(x * 0.5, 0.5, z * 0.5, x, 0, z, i / segments, 0);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
  }
  for (const sign of [-1, 1]) {
    const center = vertices.length / 8;
    vertices.push(0, sign * 0.5, 0, 0, sign, 0, 0.5, 0.5);
    for (let i = 0; i <= segments; i++) {
      const angle = i * Math.PI * 2 / segments, x = Math.cos(angle) * 0.5, z = Math.sin(angle) * 0.5;
      vertices.push(x, sign * 0.5, z, 0, sign, 0, x + 0.5, z + 0.5);
    }
    for (let i = 0; i < segments; i++) {
      if (sign > 0) indices.push(center, center + i + 2, center + i + 1);
      else indices.push(center, center + i + 1, center + i + 2);
    }
  }
  return mesh(vertices, indices);
}

function sphere(longitudes = 12, latitudes = 8) {
  const vertices = [], indices = [];
  for (let row = 0; row <= latitudes; row++) {
    const v = row / latitudes, latitude = v * Math.PI;
    for (let column = 0; column <= longitudes; column++) {
      const u = column / longitudes, longitude = u * Math.PI * 2;
      const x = Math.sin(latitude) * Math.cos(longitude), y = Math.cos(latitude), z = Math.sin(latitude) * Math.sin(longitude);
      vertices.push(x * 0.5, y * 0.5, z * 0.5, x, y, z, u, v);
    }
  }
  for (let row = 0; row < latitudes; row++) {
    for (let column = 0; column < longitudes; column++) {
      const a = row * (longitudes + 1) + column, b = a + longitudes + 1;
      if (row > 0) indices.push(a, a + 1, b);
      if (row < latitudes - 1) indices.push(a + 1, b + 1, b);
    }
  }
  return mesh(vertices, indices);
}

function cone(segments = 16) {
  const vertices = [], indices = [];
  const normalScale = 1 / Math.sqrt(1.25);
  for (let i = 0; i < segments; i++) {
    const a = i * Math.PI * 2 / segments, b = (i + 1) * Math.PI * 2 / segments;
    const base = vertices.length / 8;
    for (const [angle, y, radius, u, v] of [[a, -0.5, 0.5, i / segments, 1], [(a + b) / 2, 0.5, 0, (i + 0.5) / segments, 0], [b, -0.5, 0.5, (i + 1) / segments, 1]]) {
      vertices.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius,
        Math.cos(angle) * normalScale, 0.5 * normalScale, Math.sin(angle) * normalScale, u, v);
    }
    indices.push(base, base + 1, base + 2);
  }
  const center = vertices.length / 8;
  vertices.push(0, -0.5, 0, 0, -1, 0, 0.5, 0.5);
  for (let i = 0; i <= segments; i++) {
    const angle = i * Math.PI * 2 / segments, x = Math.cos(angle) * 0.5, z = Math.sin(angle) * 0.5;
    vertices.push(x, -0.5, z, 0, -1, 0, x + 0.5, z + 0.5);
  }
  for (let i = 0; i < segments; i++) indices.push(center, center + i + 1, center + i + 2);
  return mesh(vertices, indices);
}

function quad() {
  return mesh([
    -0.5, -0.5, 0, 0, 0, 1, 0, 1,
    0.5, -0.5, 0, 0, 0, 1, 1, 1,
    0.5, 0.5, 0, 0, 0, 1, 1, 0,
    -0.5, 0.5, 0, 0, 0, 1, 0, 0,
  ], [0, 1, 2, 0, 2, 3]);
}

export function createGeometry() {
  return { box: box(), cylinder: cylinder(), sphere: sphere(), cone: cone(), quad: quad() };
}
