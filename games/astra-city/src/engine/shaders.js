// Native WGSL only. Kept as named modules so compilation diagnostics identify a pass.
const FRAME = /* wgsl */ `
struct Frame {
  viewProjection: mat4x4<f32>,
  inverseViewProjection: mat4x4<f32>,
  lightViewProjection: mat4x4<f32>,
  cameraTime: vec4<f32>,
  sunDirectionIntensity: vec4<f32>,
  sunColorDay: vec4<f32>,
  skyZenithWet: vec4<f32>,
  skyHorizonRain: vec4<f32>,
  ambientExposure: vec4<f32>,
  viewport: vec4<f32>,
  shadowParams: vec4<f32>,
  detailParams: vec4<f32>,
  cameraPlanes: array<vec4<f32>, 6>,
  shadowPlanes: array<vec4<f32>, 6>,
  shadowCenter: vec4<f32>,
  debugParams: vec4<f32>,
};
`;

const INSTANCE = /* wgsl */ `
struct Instance {
  model: mat4x4<f32>,
  normal0: vec4<f32>,
  normal1: vec4<f32>,
  normal2: vec4<f32>,
  colorMaterial: vec4<f32>,
  parameters: vec4<f32>,
  bounds: vec4<f32>,
};
struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};
`;

const NOISE = /* wgsl */ `
fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
  return fract((p3.x + p3.y) * p3.z);
}
fn noise2(p: vec2<f32>) -> f32 {
  let cell = floor(p);
  let f = fract(p);
  let u = f * f * (vec2<f32>(3.0) - 2.0 * f);
  return mix(mix(hash21(cell), hash21(cell + vec2<f32>(1.0, 0.0)), u.x),
    mix(hash21(cell + vec2<f32>(0.0, 1.0)), hash21(cell + vec2<f32>(1.0, 1.0)), u.x), u.y);
}
fn toneMap(radiance: vec3<f32>) -> vec3<f32> {
  let x = max(vec3<f32>(0.0), radiance * frame.ambientExposure.w);
  let mapped = clamp((x * (2.51 * x + vec3<f32>(0.03))) / (x * (2.43 * x + vec3<f32>(0.59)) + vec3<f32>(0.14)), vec3<f32>(0.0), vec3<f32>(1.0));
  return pow(mapped, vec3<f32>(1.0 / 2.2));
}
fn skyRadiance(direction: vec3<f32>) -> vec3<f32> {
  let h = pow(clamp(direction.y, 0.0, 1.0), 0.47);
  var color = mix(frame.skyHorizonRain.xyz, frame.skyZenithWet.xyz, h);
  if (direction.y < 0.0) {
    color = mix(frame.skyHorizonRain.xyz * 0.52, vec3<f32>(0.038, 0.047, 0.049), clamp(-direction.y * 2.4, 0.0, 1.0));
  }
  return color;
}
fn cameraRay(pixel: vec2<f32>) -> vec3<f32> {
  let ndc = vec2<f32>(pixel.x * frame.viewport.z * 2.0 - 1.0, 1.0 - pixel.y * frame.viewport.w * 2.0);
  let farPoint = frame.inverseViewProjection * vec4<f32>(ndc, 1.0, 1.0);
  return normalize(farPoint.xyz / farPoint.w - frame.cameraTime.xyz);
}
`;

const FULLSCREEN = /* wgsl */ `
@vertex fn vsFullscreen(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
  let x = f32((index << 1u) & 2u);
  let y = f32(index & 2u);
  return vec4<f32>(x * 2.0 - 1.0, y * 2.0 - 1.0, 1.0, 1.0);
}
`;

export const CULL_WGSL = FRAME + INSTANCE + /* wgsl */ `
struct IndirectArguments {
  indexCount: u32,
  instanceCount: atomic<u32>,
  firstIndex: u32,
  baseVertex: i32,
  firstInstance: u32,
};
struct BatchInfo { count: u32, padding0: u32, padding1: u32, padding2: u32 };
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<storage, read> instances: array<Instance>;
@group(0) @binding(2) var<storage, read_write> cameraVisible: array<u32>;
@group(0) @binding(3) var<storage, read_write> shadowVisible: array<u32>;
@group(0) @binding(4) var<storage, read_write> cameraArguments: IndirectArguments;
@group(0) @binding(5) var<storage, read_write> shadowArguments: IndirectArguments;
@group(0) @binding(6) var<uniform> batch: BatchInfo;

@compute @workgroup_size(64)
fn csCull(@builtin(global_invocation_id) invocation: vec3<u32>) {
  let index = invocation.x;
  if (index >= batch.count) { return; }
  let object = instances[index];
  let bounds = object.bounds;
  let point = vec4<f32>(bounds.xyz, 1.0);
  let detail = u32(object.parameters.w + 0.5);
  let distance = length(bounds.xyz - frame.cameraTime.xyz) - bounds.w;
  var cameraInside = true;
  var shadowInside = frame.shadowParams.y > 0.001;
  for (var plane = 0u; plane < 6u; plane = plane + 1u) {
    if (dot(frame.cameraPlanes[plane], point) < -bounds.w) { cameraInside = false; }
    if (dot(frame.shadowPlanes[plane], point) < -bounds.w) { shadowInside = false; }
  }
  if ((detail == 1u && distance > frame.detailParams.x) || (detail >= 2u && distance > frame.detailParams.y)) {
    cameraInside = false;
  }
  // Shadow visibility is independent of camera visibility. Off-screen casters remain.
  if (detail >= 2u && length(bounds.xyz - frame.shadowCenter.xyz) - bounds.w > frame.detailParams.z) {
    shadowInside = false;
  }
  if (object.colorMaterial.w == 9.0) { shadowInside = false; }
  if (cameraInside) {
    let destination = atomicAdd(&cameraArguments.instanceCount, 1u);
    cameraVisible[destination] = index;
  }
  if (shadowInside) {
    let destination = atomicAdd(&shadowArguments.instanceCount, 1u);
    shadowVisible[destination] = index;
  }
}
`;

export const SHADOW_WGSL = FRAME + INSTANCE + /* wgsl */ `
@group(0) @binding(0) var<uniform> frame: Frame;
@group(1) @binding(0) var<storage, read> instances: array<Instance>;
@group(1) @binding(1) var<storage, read> visible: array<u32>;
@vertex fn vsShadow(input: VertexInput, @builtin(instance_index) instanceIndex: u32) -> @builtin(position) vec4<f32> {
  let object = instances[visible[instanceIndex]];
  return frame.lightViewProjection * object.model * vec4<f32>(input.position, 1.0);
}
`;

export const MAIN_WGSL = FRAME + INSTANCE + /* wgsl */ `
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var shadowTexture: texture_depth_2d;
@group(0) @binding(2) var shadowSampler: sampler_comparison;
@group(0) @binding(3) var signTexture: texture_2d<f32>;
@group(0) @binding(4) var signSampler: sampler;
@group(1) @binding(0) var<storage, read> instances: array<Instance>;
@group(1) @binding(1) var<storage, read> visible: array<u32>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) @interpolate(flat) colorMaterial: vec4<f32>,
  @location(4) @interpolate(flat) parameters: vec4<f32>,
};

fn swatchToLinear(color: vec3<f32>) -> vec3<f32> {
  return select(color / 12.92, pow((color + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4)), color > vec3<f32>(0.04045));
}

@vertex fn vsMain(input: VertexInput, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
  let object = instances[visible[instanceIndex]];
  let world = object.model * vec4<f32>(input.position, 1.0);
  let normalMatrix = mat3x3<f32>(object.normal0.xyz, object.normal1.xyz, object.normal2.xyz);
  var output: VertexOutput;
  output.position = frame.viewProjection * world;
  output.worldPosition = world.xyz;
  output.normal = normalMatrix * input.normal;
  output.uv = input.uv;
  // World swatches are authored like display RGB. Decode once per vertex;
  // the sign atlas is separately decoded by its rgba8unorm-srgb texture.
  output.colorMaterial = vec4<f32>(swatchToLinear(object.colorMaterial.rgb), object.colorMaterial.w);
  output.parameters = object.parameters;
  return output;
}
` + NOISE + /* wgsl */ `
fn surfacePlane(p: vec3<f32>, normal: vec3<f32>) -> vec2<f32> {
  let n = abs(normal);
  if (n.y >= n.x && n.y >= n.z) { return p.xz; }
  if (n.x > n.z) { return vec2<f32>(p.z, p.y); }
  return p.xy;
}

fn shadowFactor(p: vec3<f32>, normal: vec3<f32>, nl: f32) -> f32 {
  let shadowPosition = frame.lightViewProjection * vec4<f32>(p + normal * 0.026, 1.0);
  let ndc = shadowPosition.xyz / shadowPosition.w;
  let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  if (ndc.z <= 0.0 || ndc.z >= 1.0 || any(uv < vec2<f32>(0.002)) || any(uv > vec2<f32>(0.998))) { return 1.0; }
  let depth = ndc.z - (0.00010 + (1.0 - nl) * 0.00042);
  let texel = frame.shadowParams.x;
  var visibility = 0.0;
  if (frame.detailParams.w < 0.5) {
    visibility = textureSampleCompareLevel(shadowTexture, shadowSampler, uv, depth);
  } else if (frame.detailParams.w < 1.5) {
    visibility = (
      textureSampleCompareLevel(shadowTexture, shadowSampler, uv + vec2<f32>(-0.65, -0.65) * texel, depth) +
      textureSampleCompareLevel(shadowTexture, shadowSampler, uv + vec2<f32>( 0.65, -0.65) * texel, depth) +
      textureSampleCompareLevel(shadowTexture, shadowSampler, uv + vec2<f32>(-0.65,  0.65) * texel, depth) +
      textureSampleCompareLevel(shadowTexture, shadowSampler, uv + vec2<f32>( 0.65,  0.65) * texel, depth)) * 0.25;
  } else {
    for (var y: i32 = -1; y <= 1; y = y + 1) {
      for (var x: i32 = -1; x <= 1; x = x + 1) {
        visibility = visibility + textureSampleCompareLevel(shadowTexture, shadowSampler, uv + vec2<f32>(f32(x), f32(y)) * texel, depth);
      }
    }
    visibility = visibility / 9.0;
  }
  // Fade the map boundary over a few metres instead of a hard rectangular edge.
  let edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  return mix(1.0, visibility, frame.shadowParams.y * smoothstep(0.01, 0.08, edge));
}

@fragment fn fsMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let p = input.worldPosition;
  var normal = normalize(input.normal);
  let view = normalize(frame.cameraTime.xyz - p);
  let plane = surfacePlane(p, normal);
  let dpdxWorld = dpdx(p);
  let dpdyWorld = dpdy(p);
  let pixelWorld = max(length(dpdxWorld), length(dpdyWorld));
  let micro = clamp(1.0 - pixelWorld * 8.0, 0.0, 1.0);
  let coarse = noise2(plane * 0.47);
  let grain = mix(0.5, noise2(plane * 72.0), clamp(1.0 - pixelWorld * 70.0, 0.0, 1.0));
  let material = u32(input.colorMaterial.w + 0.5);
  let night = frame.ambientExposure.z;
  var base = max(input.colorMaterial.rgb, vec3<f32>(0.002));
  var roughness = input.parameters.x;
  var metallic = 0.0;
  var emission = input.parameters.y;
  var windowGlow = 0.0;
  var surfaceHeight = (grain - 0.5) * 0.0011;
  var creviceOcclusion = 1.0;

  if (material == 0u) {
    let stains = noise2(plane * vec2<f32>(7.5, 0.28));
    base = base * (0.91 + coarse * 0.13) * (0.96 + grain * 0.08) * (0.92 + stains * 0.10);
    let panel = fract(plane / vec2<f32>(3.2, 1.3));
    let seam = min(min(panel.x, 1.0 - panel.x) * 3.2, min(panel.y, 1.0 - panel.y) * 1.3);
    base = base * (0.965 + 0.035 * smoothstep(0.002, 0.02 + pixelWorld, seam));
    surfaceHeight = surfaceHeight + (coarse - 0.5) * 0.0012;
  } else if (material == 1u) {
    metallic = 0.68;
    let brushing = noise2(plane * vec2<f32>(1.2, 43.0));
    let wear = smoothstep(0.73, 0.9, noise2(plane * 1.6));
    base = mix(base * (0.94 + brushing * 0.09), vec3<f32>(0.22, 0.12, 0.065), wear * 0.16);
    roughness = clamp(roughness + wear * 0.22, 0.08, 0.9);
    surfaceHeight = (brushing - 0.5) * 0.00016;
  } else if (material == 2u) {
    base = base * (0.22 + input.uv.y * 0.07);
    metallic = 0.12;
    roughness = min(roughness, 0.22);
    windowGlow = step(0.82, hash21(floor(plane / vec2<f32>(3.0, 3.2)))) * night;
    surfaceHeight = 0.0;
  } else if (material == 3u) {
    let repairPatch = smoothstep(0.52, 0.6, noise2(plane * 0.16));
    let cracks = 1.0 - smoothstep(0.006, 0.027 + pixelWorld * 0.6, abs(noise2(plane * 1.15) - 0.52));
    let aggregate = mix(0.5, noise2(plane * 105.0), clamp(1.0 - pixelWorld * 85.0, 0.0, 1.0));
    base = base * (0.91 + aggregate * 0.18) * mix(1.0, 0.73, repairPatch) * (1.0 - cracks * 0.24);
    roughness = max(roughness, 0.88);
    surfaceHeight = (aggregate - 0.5) * 0.0022 - cracks * 0.002;
    creviceOcclusion = 1.0 - cracks * 0.12;
  } else if (material == 4u) {
    let wood = noise2(plane * vec2<f32>(17.0, 0.48));
    let board = min(fract(plane.x * 2.2), 1.0 - fract(plane.x * 2.2));
    base = base * (0.81 + wood * 0.28) * (0.84 + 0.16 * smoothstep(0.006, 0.035 + pixelWorld, board));
    surfaceHeight = (wood - 0.5) * 0.0005;
  } else if (material == 5u) {
    let folds = noise2(plane * vec2<f32>(8.5, 0.7));
    let weave = sin(plane.x * 205.0) * sin(plane.y * 205.0) * micro;
    base = base * (0.91 + folds * 0.16 + weave * 0.022);
    roughness = max(roughness, 0.87);
    surfaceHeight = (folds - 0.5) * 0.001;
  } else if (material == 6u) {
    emission = max(emission, 1.25);
    roughness = max(roughness, 0.35);
    surfaceHeight = 0.0;
  } else if (material == 7u) {
    base = base * (0.78 + coarse * 0.35);
    roughness = 0.96;
  } else if (material == 8u) {
    let tile = u32(input.parameters.z + 0.5);
    let tilePosition = vec2<f32>(f32(tile % 8u), f32(tile / 8u));
    let tileUV = clamp(input.uv, vec2<f32>(0.004, 0.016), vec2<f32>(0.996, 0.984));
    let texel = textureSampleLevel(signTexture, signSampler, (tilePosition + tileUV) / vec2<f32>(8.0, 16.0), 0.0);
    base = texel.rgb * mix(vec3<f32>(1.0), base, 0.2);
    emission = max(emission, 0.13 + night * 0.45);
    roughness = max(roughness, 0.52);
    surfaceHeight = 0.0;
  } else if (material == 9u) {
    normal = normalize(normal + vec3<f32>(sin(p.x * 2.2 + frame.cameraTime.w * 0.7) * 0.025, 0.0, sin(p.z * 2.6 + frame.cameraTime.w * 0.8) * 0.025));
    base = base * 0.42;
    roughness = 0.13;
    surfaceHeight = 0.0;
  } else if (material == 10u) {
    let row = floor(plane.y / 0.19);
    let brickPosition = plane / vec2<f32>(0.46, 0.19) + vec2<f32>(fract(row * 0.5), 0.0);
    let cell = fract(brickPosition);
    let edge = min(min(cell.x, 1.0 - cell.x) * 0.46, min(cell.y, 1.0 - cell.y) * 0.19);
    let mortar = 1.0 - smoothstep(0.007, 0.018 + pixelWorld * 0.3, edge);
    let brickColor = base * (0.82 + hash21(floor(brickPosition)) * 0.3) * (0.95 + grain * 0.1);
    base = mix(brickColor, base * 0.35 + vec3<f32>(0.035, 0.034, 0.029), mortar * clamp(1.0 - pixelWorld * 3.0, 0.0, 1.0));
    roughness = max(roughness, 0.86);
    surfaceHeight = (grain - 0.5) * 0.001 - mortar * 0.003;
    creviceOcclusion = 1.0 - mortar * 0.23;
  } else if (material == 11u) {
    let tilePosition = plane / vec2<f32>(0.7, 0.42);
    let tile = fract(tilePosition + vec2<f32>(fract(floor(tilePosition.y) * 0.5), 0.0));
    let edge = min(min(tile.x, 1.0 - tile.x) * 0.7, min(tile.y, 1.0 - tile.y) * 0.42);
    let seam = 1.0 - smoothstep(0.007, 0.017 + pixelWorld * 0.3, edge);
    base = base * (0.92 + hash21(floor(tilePosition)) * 0.14) * (0.96 + grain * 0.07);
    base = base * (1.0 - seam * 0.33 * clamp(1.0 - pixelWorld * 2.0, 0.0, 1.0));
    surfaceHeight = (grain - 0.5) * 0.0011 - seam * 0.0035;
    creviceOcclusion = 1.0 - seam * 0.28;
  }

  // Surface-gradient bump mapping uses metre-scale relief; no normal-map assets.
  // Derivatives are evaluated after reconvergence, outside material branches.
  let slopeX = dpdx(surfaceHeight);
  let slopeY = dpdy(surfaceHeight);
  let tangentX = cross(dpdyWorld, normal);
  let tangentY = cross(normal, dpdxWorld);
  let determinant = dot(dpdxWorld, tangentX);
  let heightGradient = sign(determinant) * (tangentX * slopeX + tangentY * slopeY);
  normal = normalize(max(abs(determinant), 0.0000001) * normal - heightGradient);

  let horizontal = pow(max(normal.y, 0.0), 4.0);
  let wetness = frame.skyZenithWet.w;
  let puddle = smoothstep(0.38, 0.75, noise2(plane * 0.39 + vec2<f32>(17.0, 8.0)));
  let wetSurface = horizontal * wetness * puddle * select(1.0, 0.18, material == 5u || material == 7u);
  base = base * (1.0 - wetSurface * 0.23 - wetness * 0.025);
  roughness = clamp(mix(roughness, 0.16, wetSurface * 0.84), 0.045, 1.0);

  let light = frame.sunDirectionIntensity.xyz;
  let halfVector = normalize(light + view + vec3<f32>(0.000001));
  let nl = max(dot(normal, light), 0.0);
  let nv = max(dot(normal, view), 0.001);
  let nh = max(dot(normal, halfVector), 0.0);
  let vh = max(dot(view, halfVector), 0.0);
  let f0 = mix(vec3<f32>(0.04), base, metallic);
  let fresnel = f0 + (vec3<f32>(1.0) - f0) * pow(1.0 - vh, 5.0);
  let alpha = roughness * roughness;
  let alpha2 = alpha * alpha;
  let distributionDenominator = nh * nh * (alpha2 - 1.0) + 1.0;
  let distribution = alpha2 / max(3.14159265 * distributionDenominator * distributionDenominator, 0.00001);
  let k = (roughness + 1.0) * (roughness + 1.0) * 0.125;
  let geometry = (nv / (nv * (1.0 - k) + k)) * (nl / max(nl * (1.0 - k) + k, 0.001));
  let specular = fresnel * distribution * geometry / max(4.0 * nv * nl, 0.001);
  let diffuse = (vec3<f32>(1.0) - fresnel) * base * (1.0 - metallic) / 3.14159265;
  let shadow = shadowFactor(p, normal, nl);
  let sunlight = frame.sunColorDay.rgb * frame.sunDirectionIntensity.w;
  let hemi = normal.y * 0.5 + 0.5;
  let ambientTint = mix(vec3<f32>(0.66, 0.61, 0.53) * frame.ambientExposure.y,
    vec3<f32>(0.72, 0.81, 0.96) * frame.ambientExposure.x, hemi);
  var color = base * ambientTint * (0.78 + max(normal.y, 0.0) * 0.22) * creviceOcclusion + (diffuse + specular) * sunlight * nl * shadow;
  let reflectedSky = skyRadiance(reflect(-view, normal));
  let grazingFresnel = f0 + (vec3<f32>(1.0) - f0) * pow(1.0 - nv, 5.0);
  color = color + reflectedSky * grazingFresnel * (0.4 + metallic * 0.7 + wetSurface * 0.6) * (1.0 - roughness * 0.75);
  if (material == 2u || material == 9u) {
    color = color + reflectedSky * (0.12 + 0.49 * pow(1.0 - nv, 3.0)) * (1.0 - roughness);
    color = color + vec3<f32>(0.36, 0.22, 0.095) * windowGlow;
  }
  if (material == 7u) {
    color = color + base * sunlight * max(dot(-normal, light), 0.0) * 0.07;
  }
  color = color + base * emission * (0.7 + night * 0.65);

  if (frame.shadowParams.w > 0.5) {
    let distance = length(p - frame.cameraTime.xyz);
    let haze = min(0.78, 1.0 - exp(-max(0.0, distance - 24.0) * frame.shadowCenter.w));
    color = mix(color, skyRadiance(normalize(p - frame.cameraTime.xyz)), haze);
  }
  if(frame.debugParams.x>2.5){return vec4<f32>(vec3<f32>(nl*shadow),1.0);}
  if(frame.debugParams.x>1.5){return vec4<f32>(pow(max(base,vec3<f32>(0.0)),vec3<f32>(1.0/2.2)),1.0);}
  if(frame.debugParams.x>0.5){return vec4<f32>(normal*0.5+vec3<f32>(0.5),1.0);}
  return vec4<f32>(toneMap(color), 1.0);
}

@fragment fn fsWire(input: VertexOutput) -> @location(0) vec4<f32> {
  let distance = length(input.worldPosition - frame.cameraTime.xyz);
  let fade = clamp(1.0 - distance / 1200.0, 0.25, 1.0);
  return vec4<f32>(vec3<f32>(0.31, 0.88, 0.78) * fade, 1.0);
}
`;

export const SKY_WGSL = FRAME + /* wgsl */ `
@group(0) @binding(0) var<uniform> frame: Frame;
` + NOISE + FULLSCREEN + /* wgsl */ `
@fragment fn fsSky(@builtin(position) pixel: vec4<f32>) -> @location(0) vec4<f32> {
  let ray = cameraRay(pixel.xy);
  let day = frame.sunColorDay.w;
  var color = skyRadiance(ray);
  let alignment = max(dot(ray, frame.sunDirectionIntensity.xyz), 0.0);
  let disc = smoothstep(0.99976, 0.99994, alignment);
  let halo = pow(alignment, 96.0) * (0.12 + day * 0.12);
  color = color + frame.sunColorDay.rgb * (disc * (0.75 + day * 3.0) + halo * day);
  if (ray.y > 0.0) {
    let cloudUV = ray.xz / max(ray.y + 0.22, 0.12) * 1.45 + vec2<f32>(frame.cameraTime.w * 0.003, 0.0);
    let cloudNoise = noise2(cloudUV) * 0.65 + noise2(cloudUV * 2.6) * 0.35;
    let cloudCover = smoothstep(mix(0.69, 0.42, frame.shadowParams.z), 0.84, cloudNoise);
    let cloudFade = smoothstep(0.015, 0.19, ray.y) * (0.21 + frame.shadowParams.z * 0.42);
    let cloudColor = mix(vec3<f32>(0.055, 0.07, 0.092), vec3<f32>(0.74, 0.76, 0.75), day);
    color = mix(color, cloudColor, cloudCover * cloudFade);
    let starGrid = floor(ray.xz / max(0.15, ray.y + 0.16) * 360.0);
    let star = step(0.9992, hash21(starGrid));
    color = color + vec3<f32>(0.35, 0.42, 0.53) * star * (1.0 - day) * (1.0 - frame.shadowParams.z) * smoothstep(0.08, 0.4, ray.y);
  }
  return vec4<f32>(toneMap(color), 1.0);
}
`;

export const RAIN_WGSL = FRAME + /* wgsl */ `
@group(0) @binding(0) var<uniform> frame: Frame;
` + NOISE + FULLSCREEN + /* wgsl */ `
@fragment fn fsRain(@builtin(position) pixel: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = pixel.xy / frame.viewport.xy;
  let slant = uv.x * 160.0 + uv.y * 21.0;
  let column = floor(slant);
  let seed = hash21(vec2<f32>(column, 17.0));
  let travel = uv.y * (7.0 + seed * 4.0) - frame.cameraTime.w * (3.5 + seed * 2.0) + seed * 11.0;
  let trail = fract(travel);
  let exists = step(0.28, hash21(vec2<f32>(column, floor(travel))));
  let width = max(0.018, 110.0 / frame.viewport.x);
  let streak = (1.0 - smoothstep(0.0, width, abs(fract(slant) - 0.5))) * smoothstep(0.68, 0.95, trail) * (1.0 - smoothstep(0.97, 1.0, trail));
  let alpha = streak * exists * frame.skyHorizonRain.w * 0.115;
  return vec4<f32>(0.62, 0.71, 0.76, alpha);
}
`;
