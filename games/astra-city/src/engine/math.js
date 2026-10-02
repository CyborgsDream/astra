// Small, allocation-conscious column-major matrix helpers. WebGPU clip depth is 0..1.
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function normalize3(v) {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > 1e-10 ? [v[0] / length, v[1] / length, v[2] / length] : [0, 1, 0];
}

export function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function multiply4(a, b, out = new Float32Array(16)) {
  // Callers supply a distinct output matrix.
  for (let column = 0; column < 4; column++) {
    const offset = column * 4;
    for (let row = 0; row < 4; row++) {
      out[offset + row] = a[row] * b[offset] + a[4 + row] * b[offset + 1]
        + a[8 + row] * b[offset + 2] + a[12 + row] * b[offset + 3];
    }
  }
  return out;
}

export function perspective(fovRadians, aspect, near, far, out = new Float32Array(16)) {
  out.fill(0);
  const f = 1 / Math.tan(fovRadians * 0.5);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = far / (near - far);
  out[11] = -1;
  out[14] = far * near / (near - far);
  return out;
}

export function orthographic(left, right, bottom, top, near, far, out = new Float32Array(16)) {
  out.fill(0);
  out[0] = 2 / (right - left);
  out[5] = 2 / (top - bottom);
  out[10] = 1 / (near - far);
  out[12] = -(right + left) / (right - left);
  out[13] = -(top + bottom) / (top - bottom);
  out[14] = near / (near - far);
  out[15] = 1;
  return out;
}

export function lookAt(eye, target, up = [0, 1, 0], out = new Float32Array(16)) {
  const z = normalize3([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  let x = cross3(up, z);
  if (Math.hypot(...x) < 1e-5) x = cross3([0, 0, 1], z);
  x = normalize3(x);
  const y = cross3(z, x);
  out.set([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1]);
  return out;
}

export function invert4(a, out = new Float32Array(16)) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let determinant = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(determinant) < 1e-14) throw new Error('Camera projection matrix is singular.');
  determinant = 1 / determinant;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * determinant;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * determinant;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * determinant;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * determinant;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * determinant;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * determinant;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * determinant;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * determinant;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * determinant;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * determinant;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * determinant;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * determinant;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * determinant;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * determinant;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * determinant;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * determinant;
  return out;
}

export function frustumPlanes(matrix, out, floatOffset = 0) {
  // Left, right, bottom, top, near (z >= 0), far (z <= w).
  const combinations = [[3, 0, 1], [3, 0, -1], [3, 1, 1], [3, 1, -1], [2, -1, 0], [3, 2, -1]];
  for (let i = 0; i < 6; i++) {
    const [a, b, sign] = combinations[i];
    let x = matrix[a], y = matrix[4 + a], z = matrix[8 + a], w = matrix[12 + a];
    if (b >= 0) {
      x += matrix[b] * sign;
      y += matrix[4 + b] * sign;
      z += matrix[8 + b] * sign;
      w += matrix[12 + b] * sign;
    }
    const inverseLength = 1 / Math.hypot(x, y, z);
    out.set([x * inverseLength, y * inverseLength, z * inverseLength, w * inverseLength], floatOffset + i * 4);
  }
  return out;
}

// Matches the player controller: mouse right decreases yaw; positive pitch looks up.
export function cameraForward(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

// Instance layout is 40 floats / 160 bytes. XYZ Euler is R_x * R_y * R_z.
export function packInstance(target, offset, instance, materialDefaults) {
  const p = instance.position ?? [0, 0, 0];
  const s = instance.scale ?? [1, 1, 1];
  const r = instance.rotation ?? [0, 0, 0];
  const color = instance.color ?? [0.65, 0.65, 0.65];
  if (![...p, ...s, ...r, ...color].every(Number.isFinite) || p.length < 3 || s.length < 3 || r.length < 3 || color.length < 3) {
    throw new TypeError('An instance contains an invalid position, scale, rotation, or color.');
  }
  const cx = Math.cos(r[0]), sx = Math.sin(r[0]);
  const cy = Math.cos(r[1]), sy = Math.sin(r[1]);
  const cz = Math.cos(r[2]), sz = Math.sin(r[2]);
  const x0 = cy * cz, x1 = cx * sz + sx * cz * sy, x2 = sx * sz - cx * cz * sy;
  const y0 = -cy * sz, y1 = cx * cz - sx * sz * sy, y2 = sx * cz + cx * sz * sy;
  const z0 = sy, z1 = -sx * cy, z2 = cx * cy;
  const inverseScale = s.map(value => Math.abs(value) < 1e-8 ? 0 : 1 / value);
  target.set([
    x0 * s[0], x1 * s[0], x2 * s[0], 0,
    y0 * s[1], y1 * s[1], y2 * s[1], 0,
    z0 * s[2], z1 * s[2], z2 * s[2], 0,
    p[0], p[1], p[2], 1,
    x0 * inverseScale[0], x1 * inverseScale[0], x2 * inverseScale[0], 0,
    y0 * inverseScale[1], y1 * inverseScale[1], y2 * inverseScale[1], 0,
    z0 * inverseScale[2], z1 * inverseScale[2], z2 * inverseScale[2], 0,
  ], offset);
  const material = clamp(Math.round(Number.isFinite(instance.material) ? instance.material : 0), 0, 11);
  const roughness = Number.isFinite(instance.roughness) ? clamp(instance.roughness, 0.045, 1) : materialDefaults[material];
  const emission = Number.isFinite(instance.emissive) ? Math.max(0, instance.emissive) : (material === 6 ? 1.4 : material === 8 ? 0.15 : 0);
  target.set([
    clamp(color[0], 0, 1), clamp(color[1], 0, 1), clamp(color[2], 0, 1), material,
    roughness, emission, clamp(Math.floor(instance.tile ?? 0), 0, 127), clamp(Math.floor(instance.detail ?? 0), 0, 2),
    p[0], p[1], p[2], 0.5 * Math.hypot(s[0], s[1], s[2]),
  ], offset + 28);
}
