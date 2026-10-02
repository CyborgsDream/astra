/* ASTRA CITY population. Native geometry instances; no renderer dependency. */
const TAU = Math.PI * 2;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const isPoint = p => p && p.length >= 3 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const turn = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * Math.min(1, t);
function random(seed) {
  let state = (Number(seed) || 73191) >>> 0;
  return () => { state += 0x6d2b79f5; let n = Math.imul(state ^ state >>> 15, 1 | state); n ^= n + Math.imul(n ^ n >>> 7, 61 | n); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}

function graph() { return { nodes: [], edges: [], ids: new Map(), keys: new Set(), active: [], components: [], totalLength: 0 }; }
function node(g, id, p) {
  const key = String(id);
  if (g.ids.has(key)) return g.ids.get(key);
  if (!isPoint(p) || g.nodes.length >= 4096) return -1;
  const index = g.nodes.length;
  g.ids.set(key, index); g.nodes.push({ id: key, p: [p[0], p[1], p[2]], links: [], component: -1 });
  return index;
}
function edge(g, a, b, width = 8) {
  if (a < 0 || b < 0 || a === b || !g.nodes[a] || !g.nodes[b]) return;
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  if (g.keys.has(key)) return;
  const length = distance(g.nodes[a].p, g.nodes[b].p);
  if (length < .05 || !Number.isFinite(length)) return;
  g.keys.add(key); g.edges.push({ a, b, length, width });
  g.nodes[a].links.push({ to: b, length, width }); g.nodes[b].links.push({ to: a, length, width });
  g.totalLength += length;
}
function finish(g) {
  for (let i = 0; i < g.nodes.length; i++) {
    if (!g.nodes[i].links.length || g.nodes[i].component >= 0) continue;
    const group = [], queue = [i], id = g.components.length;
    g.nodes[i].component = id;
    for (let q = 0; q < queue.length; q++) {
      const n = queue[q]; group.push(n); g.active.push(n);
      for (const e of g.nodes[n].links) if (g.nodes[e.to].component < 0) { g.nodes[e.to].component = id; queue.push(e.to); }
    }
    g.components.push(group);
  }
  g.dist = new Float64Array(g.nodes.length); g.previous = new Int32Array(g.nodes.length); g.visited = new Uint8Array(g.nodes.length);
  return g;
}
function suppliedGraph(world, kind) {
  const g = graph(), nodes = Array.isArray(world.navNodes) ? world.navNodes : [];
  for (const n of nodes) if (n && (n.kind || 'foot') === kind) node(g, n.id, n.position);
  const connect = (a, b) => {
    if (kind === 'foot' && g.nodes[a] && g.nodes[b]) {
      const p = g.nodes[a].p, q = g.nodes[b].p;
      const rise = Math.abs(q[1] - p[1]), run = Math.hypot(q[0] - p[0], q[2] - p[2]);
      // Ambient walkers cannot operate lifts or climb ladders. Preserve small
      // steps and normal stair flights, including the district's roof stairs.
      if (rise > .35 && rise > run * .8) return;
    }
    edge(g, a, b);
  };
  for (const e of Array.isArray(world.navEdges) ? world.navEdges : []) if (Array.isArray(e)) connect(g.ids.get(String(e[0])) ?? -1, g.ids.get(String(e[1])) ?? -1);
  for (const n of nodes) if (n && g.ids.has(String(n.id)) && Array.isArray(n.neighbours)) for (const id of n.neighbours) connect(g.ids.get(String(n.id)), g.ids.get(String(id)) ?? -1);
  return finish(g);
}
// Split supplied road segments at geometric intersections. A fallback never joins
// unrelated nav points with a straight line through a building.
function roadsGraph(world) {
  const g = graph(), segments = [];
  for (const r of Array.isArray(world.roads) ? world.roads : []) {
    if (!r || !Array.isArray(r.points)) continue;
    for (let i = 1; i < r.points.length && segments.length < 512; i++) {
      const a = r.points[i - 1], b = r.points[i];
      if (!a || !b || ![a[0], a[1], b[0], b[1]].every(Number.isFinite) || Math.hypot(b[0] - a[0], b[1] - a[1]) < .1) continue;
      segments.push({ a, b, marks: [0, 1], width: clamp(Number(r.width) || 8, 2.5, 36) });
    }
  }
  const project = (p, s) => ((p[0] - s.a[0]) * (s.b[0] - s.a[0]) + (p[1] - s.a[1]) * (s.b[1] - s.a[1])) / ((s.b[0] - s.a[0]) ** 2 + (s.b[1] - s.a[1]) ** 2);
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const a = segments[i], b = segments[j], ax = a.b[0] - a.a[0], az = a.b[1] - a.a[1], bx = b.b[0] - b.a[0], bz = b.b[1] - b.a[1];
    const cross = ax * bz - az * bx, dx = b.a[0] - a.a[0], dz = b.a[1] - a.a[1];
    if (Math.abs(cross) > 1e-6) {
      const t = (dx * bz - dz * bx) / cross, u = (dx * az - dz * ax) / cross;
      if (t >= -1e-5 && t <= 1.00001 && u >= -1e-5 && u <= 1.00001) { a.marks.push(clamp(t, 0, 1)); b.marks.push(clamp(u, 0, 1)); }
    } else if (Math.abs(dx * az - dz * ax) < .01) {
      for (const p of [b.a, b.b]) { const t = project(p, a); if (t > 0 && t < 1) a.marks.push(t); }
      for (const p of [a.a, a.b]) { const t = project(p, b); if (t > 0 && t < 1) b.marks.push(t); }
    }
  }
  for (const s of segments) {
    s.marks.sort((a, b) => a - b); let previous = -1;
    for (const t of s.marks) {
      const x = s.a[0] + (s.b[0] - s.a[0]) * t, z = s.a[1] + (s.b[1] - s.a[1]) * t;
      const index = node(g, `${Math.round(x * 100)}:${Math.round(z * 100)}`, [x, 0, z]);
      edge(g, previous, index, s.width); previous = index;
    }
  }
  return finish(g);
}
function shortest(g, from, to) {
  if (from === to || !g.nodes[from] || !g.nodes[to]) return [from];
  g.dist.fill(Infinity); g.previous.fill(-1); g.visited.fill(0); g.dist[from] = 0;
  for (let count = 0; count < g.nodes.length; count++) {
    let at = -1, best = Infinity;
    for (let i = 0; i < g.nodes.length; i++) if (!g.visited[i] && g.dist[i] < best) { at = i; best = g.dist[i]; }
    if (at < 0 || at === to) break;
    g.visited[at] = 1;
    for (const e of g.nodes[at].links) if (best + e.length < g.dist[e.to]) { g.dist[e.to] = best + e.length; g.previous[e.to] = at; }
  }
  if (!Number.isFinite(g.dist[to])) return [from];
  const path = []; let at = to;
  while (at >= 0 && path.length <= g.nodes.length) { path.push(at); if (at === from) break; at = g.previous[at]; }
  return path.reverse();
}
function nearest(g, p) {
  let index = -1, best = Infinity;
  for (const i of g.active) { const n = g.nodes[i].p, d = (n[0] - p[0]) ** 2 + (n[2] - p[2]) ** 2 + 9 * (n[1] - p[1]) ** 2; if (d < best) { best = d; index = i; } }
  return index;
}

const SKIN = [[.63,.40,.27],[.86,.65,.48],[.32,.19,.13],[.73,.49,.34],[.46,.29,.21],[.94,.75,.58]];
const HAIR = [[.055,.039,.03],[.16,.09,.045],[.35,.24,.12],[.43,.44,.40],[.12,.10,.09],[.51,.22,.13]];
const CLOTHES = {
  resident: [[.15,.28,.28],[.43,.23,.19],[.31,.27,.42],[.62,.51,.33],[.22,.33,.48],[.51,.38,.32]],
  worker: [[.77,.46,.11],[.17,.36,.42],[.58,.32,.14],[.39,.43,.39]],
  vendor: [[.44,.28,.37],[.69,.47,.30],[.24,.42,.38],[.32,.39,.48]],
  security: [[.12,.21,.25],[.18,.25,.29],[.17,.23,.22]],
  courier: [[.75,.31,.12],[.17,.46,.43],[.39,.25,.52],[.69,.55,.17]]
};
const ROLE_NAMES = ['resident','resident','worker','courier','resident','vendor','worker','security'];
const AUTHORED = { mara: 'courier', ivo: 'worker', sana: 'vendor', orin: 'worker', rescue: 'worker' };
const DARK = [.045,.055,.065], GLASS = [.075,.20,.25], METAL = [.28,.33,.35], WHITE = [.81,.83,.77];

function part(actor, mesh, x, y, z, sx, sy, sz, color, material = 0, detail = 1, rx = 0, ry = 0, rz = 0, emissive = 0) {
  const p = { mesh, position: [0,0,0], scale: [sx,sy,sz], rotation: [rx,ry,rz], color, material, detail, roughness: material === 2 ? .18 : .72, emissive };
  const record = { instance: p, x,y,z,sx,sy,sz,rx,ry,rz, detail };
  actor.parts.push(record); return record;
}
function local(actor, p, x = p.x, y = p.y, z = p.z, rx = p.rx, ry = p.ry, rz = p.rz) {
  const i = p.instance, c = actor.cos, s = actor.sin;
  i.position[0] = actor.position[0] + c * x + s * z;
  i.position[1] = actor.position[1] + y;
  i.position[2] = actor.position[2] - s * x + c * z;
  i.rotation[0] = rx; i.rotation[1] = actor.yaw + ry; i.rotation[2] = rz;
}
function limb(a, p, x0,y0,z0,x1,y1,z1) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  p.instance.scale[1] = Math.max(.015, Math.hypot(dx,dy,dz));
  local(a,p,(x0+x1)/2,(y0+y1)/2,(z0+z1)/2,Math.atan2(-dz,-dy),0,Math.atan2(dx,Math.hypot(dy,dz)));
}
function humanoid(a, rng, riding = false) {
  const skin = SKIN[Math.floor(rng()*SKIN.length)], hair = HAIR[Math.floor(rng()*HAIR.length)];
  const palette = CLOTHES[a.role] || CLOTHES.resident, cloth = palette[Math.floor(rng()*palette.length)];
  const pants = rng() > .5 ? [.13,.18,.22] : [.23,.22,.19];
  const h = { riding, body: [], head: [], arms: [], legs: [], accessories: [] };
  const add = (group,...args) => { const p = part(a,...args); h[group].push(p); return p; };
  add('body','box',0,1.13,0,.43,.56,.25,cloth,5);
  add('body','box',0,.84,0,.34,.16,.235,pants,5);
  add('body','box',0,.87,-.123,.36,.045,.018,DARK,5,2);
  add('head','cylinder',0,1.455,0,.12,.15,.12,skin,0,1);
  add('head','sphere',0,1.65,-.008,.275,.345,.265,skin,0,1);
  add('head','sphere',0,1.77,.019,.289,.205,.272,hair,5,1);
  add('head','box',0,1.675,.103,.265,.175,.085,hair,5,2);
  add('head','box',0,1.633,-.145,.055,.072,.043,skin,0,2);
  add('head','sphere',-.060,1.696,-.126,.028,.025,.018,DARK,0,2);
  add('head','sphere',.060,1.696,-.126,.028,.025,.018,DARK,0,2);
  if (a.index % 3 === 0) add('head','sphere',0,1.725,.18,.155,.16,.17,hair,5,2);
  for (const side of [-1,1]) {
    h.arms.push({ side, upper: part(a,'box',0,0,0,.142,.30,.165,cloth,5), lower: part(a,'box',0,0,0,.118,.26,.14,a.index%3===1?skin:cloth,5), hand: part(a,'sphere',0,0,0,.114,.137,.114,skin) });
    h.legs.push({ side, upper: part(a,'box',0,0,0,.158,.36,.19,pants,5), lower: part(a,'box',0,0,0,.135,.37,.156,pants,5), shoe: part(a,'box',0,0,0,.18,.108,.31,DARK,1) });
  }
  if (a.role === 'worker') {
    add('head','sphere',0,1.808,.002,.335,.18,.305,[.9,.64,.17],1);
    add('head','box',0,1.782,-.105,.36,.04,.265,[.87,.59,.12],1);
    for (const x of [-.145,.145]) add('body','box',x,1.15,-.133,.045,.50,.018,[.86,.87,.56],5,2);
    add('body','box',.22,.85,.01,.125,.185,.15,[.19,.19,.17],5,2);
  } else if (a.role === 'courier') {
    add('body','box',0,1.19,.225,.36,.47,.24,[.11,.24,.24],5);
    add('body','box',0,1.20,.354,.22,.085,.013,[.83,.64,.23],5,2);
    add('body','box',-.13,1.15,-.137,.045,.54,.026,DARK,5,2,0,0,-.12);
    add('body','box',.13,1.15,-.137,.045,.54,.026,DARK,5,2,0,0,.12);
  } else if (a.role === 'vendor') {
    add('body','box',0,1.035,-.148,.32,.69,.024,[.75,.74,.59],5);
    add('body','box',0,.97,-.168,.21,.15,.026,[.55,.58,.47],5,2);
    add('head','box',0,1.685,-.15,.235,.06,.022,DARK,1,2);
  } else if (a.role === 'security') {
    add('head','cylinder',0,1.804,.01,.32,.085,.30,[.10,.18,.21],5);
    add('head','box',0,1.784,-.123,.29,.025,.20,[.08,.14,.17],5);
    add('body','box',0,1.16,-.145,.37,.39,.03,[.16,.22,.25],1);
    add('body','box',-.105,1.31,-.17,.075,.08,.02,[.77,.72,.39],1,2);
    add('body','box',.13,1.2,-.19,.08,.17,.08,DARK,1,2);
  } else if (a.index % 4 === 0) {
    add('body','box',0,1.4,-.03,.39,.10,.31,[.59,.43,.29],5);
    add('body','box',.105,1.18,-.152,.10,.35,.024,[.59,.43,.29],5,2);
  }
  a.human = h;
}

function poseHuman(a, time) {
  const h = a.human, crouch = a.id === 'rescue' ? .35 : 0;
  const moving = clamp(a.speed / 1.6,0,1), phase = a.walkPhase;
  const bob = Math.sin(phase*2) * .018 * moving + Math.sin(time*1.55+a.phase)*.006;
  for (const p of h.body) local(a,p,p.x,p.y+bob-crouch,p.z);
  for (const p of h.head) local(a,p,p.x,p.y+bob-crouch,p.z);
  for (const arm of h.arms) {
    const side = arm.side, swing = Math.sin(phase+(side<0?Math.PI:0))*.40*moving;
    let ex=side*.29, ey=1.10+bob-crouch, ez=Math.sin(swing)*.29;
    let hx=side*.29, hy=.865+bob-crouch, hz=Math.sin(swing)*.52-.015;
    if (h.riding) { ey=1.16; ez=-.25; hy=1.11; hz=-.49; hx=side*.31; }
    else if (crouch) { ey=.79; ez=-.20; hy=.64; hz=-.26; }
    else if (a.authored && a.role==='vendor' && side>0) { ey=1.15+bob; ez=-.09; hy=1.06+bob+Math.sin(time*.8)*.025; hz=-.28; }
    limb(a,arm.upper,side*.255,1.375+bob-crouch,0,ex,ey,ez);
    limb(a,arm.lower,ex,ey,ez,hx,hy,hz);
    local(a,arm.hand,hx,hy-.04,hz);
  }
  for (const leg of h.legs) {
    const side=leg.side, swing=Math.sin(phase+(side<0?0:Math.PI))*.58*moving;
    const kneeBend=Math.max(0,-Math.sin(phase+(side<0?0:Math.PI)))*.55*moving;
    let ky=.47-Math.abs(Math.sin(swing))*.035, kz=-Math.sin(swing)*.34;
    let fy=.09+Math.max(0,Math.sin(phase+(side<0?0:Math.PI)))*.09*moving, fz=kz-Math.sin(swing+kneeBend)*.30;
    if (h.riding) { ky=.61; kz=-.24; fy=.44; fz=-.18; }
    else if (crouch) { ky=.29; kz=-.27; fy=.09; fz=-.13; }
    limb(a,leg.upper,side*.106,.825+bob-crouch,0,side*.115,ky,kz);
    limb(a,leg.lower,side*.115,ky,kz,side*.118,fy,fz);
    local(a,leg.shoe,side*.118,fy-.029,fz-.065);
  }
}

function roadVehicle(a, rng) {
  const paint = [[.21,.37,.37],[.65,.49,.26],[.34,.39,.43],[.61,.26,.16],[.70,.71,.65],[.16,.24,.31]][Math.floor(rng()*6)];
  const add=(...args)=>part(a,...args);
  if (a.kind==='scooter') {
    a.length=1.7; a.width=.72;
    add('box',0,.39,0,.34,.13,1.22,DARK,1);
    add('box',0,.70,-.35,.44,.60,.21,paint,1,1,-.12);
    add('box',0,.79,.23,.46,.12,.44,DARK,5);
    add('box',0,.50,.25,.38,.28,.71,paint,1);
    add('box',0,1.08,-.50,.78,.055,.075,METAL,1);
    add('box',0,.89,-.494,.29,.13,.03,[.93,.86,.61],6,2,0,0,0,1.1);
    add('box',0,.64,.63,.22,.07,.025,[.80,.12,.055],6,2,0,0,0,.7);
    for (const z of [-.59,.59]) add('cylinder',0,.255,z,.52,.14,.52,DARK,1,1,0,0,Math.PI/2);
    humanoid(a,rng,true);
    return;
  }
  const van=a.kind==='van'; a.length=van?4.4:3.8; a.width=van?1.9:1.75;
  add('box',0,.57,0,a.width,.48,a.length,paint,1);
  add('box',0,.34,0,a.width*.87,.16,a.length*.92,DARK,1);
  if(van) {
    add('box',0,1.29,.49,1.87,1.35,2.72,paint,1);
    add('box',0,1.10,-1.34,1.80,.71,1.28,paint,1);
    add('box',0,1.36,-1.993,1.58,.53,.022,GLASS,2);
    for(const x of [-.918,.918]) { add('box',x,1.41,-1.30,.025,.48,.94,GLASS,2); add('box',x,1.26,.55,.031,.25,2.05,[.79,.57,.20],1); }
    add('box',0,1.28,1.866,.025,1.24,.025,METAL,1,2);
    for(const x of [-.16,.16]) add('box',x,1.13,1.89,.045,.18,.035,DARK,1,2);
  } else {
    add('box',0,1.05,.16,1.47,.54,1.88,paint,1);
    add('box',0,1.066,-.801,1.33,.40,.023,GLASS,2,1,-.20);
    add('box',0,1.067,1.121,1.34,.40,.024,GLASS,2,1,.18);
    for(const x of [-.747,.747]) { add('box',x,1.087,.12,.025,.37,1.64,GLASS,2); add('box',x,1.08,.14,.035,.44,.075,paint,1,2); add('box',x,.79,.27,.031,.04,.22,METAL,1,2); }
    add('box',0,1.335,.16,1.50,.065,1.90,paint,1);
  }
  for(const x of [-a.width*.47,a.width*.47]) for(const z of [-a.length*.30,a.length*.30]) {
    add('cylinder',x,.34,z,.66,.22,.66,DARK,1,1,0,0,Math.PI/2);
    add('cylinder',x*1.14,.34,z,.36,.027,.36,METAL,1,2,0,0,Math.PI/2);
  }
  for(const x of [-a.width*.34,a.width*.34]) {
    add('box',x,.65,-a.length*.503,.33,.16,.025,[.88,.85,.63],6,1,0,0,0,.65);
    add('box',x,.64,a.length*.503,.28,.12,.025,[.75,.08,.035],6,1,0,0,0,.5);
    add('box',x*1.56,1.00,-.77,.17,.12,.24,paint,1,2);
  }
  add('box',0,.51,-a.length*.508,.61,.13,.025,DARK,1,2);
}
function robot(a) {
  a.length=.85; a.width=.62;
  part(a,'box',0,.39,0,.63,.45,.78,[.62,.66,.60],1);
  part(a,'box',0,.64,0,.59,.08,.72,[.78,.57,.19],1);
  part(a,'box',0,.47,-.398,.41,.13,.026,DARK,2);
  for(const x of [-.13,.13]) part(a,'sphere',x,.477,-.418,.07,.055,.025,[.21,.72,.78],6,1,0,0,0,1.3);
  for(const x of [-.34,.34]) for(const z of [-.24,.24]) part(a,'cylinder',x,.15,z,.28,.09,.28,DARK,1,1,0,0,Math.PI/2);
  part(a,'cylinder',.23,.91,.18,.026,.60,.026,METAL,1,2);
  part(a,'sphere',.23,1.235,.18,.11,.09,.11,[.95,.44,.08],6,2,0,0,0,.8);
}
function drone(a) {
  a.length=1.1; a.width=1.1; a.rotors=[];
  part(a,'box',0,0,0,.57,.23,.78,[.34,.40,.39],1);
  part(a,'sphere',0,-.17,-.27,.22,.21,.20,DARK,2);
  part(a,'sphere',0,-.17,-.371,.085,.08,.02,[.24,.74,.81],6,2,0,0,0,.9);
  for(const x of [-.51,.51]) for(const z of [-.48,.48]) {
    part(a,'box',x*.50,.02,z*.50,.75,.05,.065,METAL,1,1,0,-Math.sign(x*z)*.75);
    part(a,'cylinder',x,.11,z,.11,.14,.11,DARK,1);
    a.rotors.push(part(a,'box',x,.19,z,.64,.018,.07,[.20,.24,.23],1));
    part(a,'sphere',x,.03,z,.07,.055,.07,x<0?[.86,.16,.06]:[.13,.68,.42],6,2,0,0,0,1.3);
  }
  part(a,'box',0,-.37,.04,.43,.37,.49,[.64,.48,.27],4);
}
function tramBody(a) {
  a.length=12.3; a.width=2.6; a.doors=[];
  const paint=[.26,.43,.40];
  part(a,'box',0,.25,0,2.55,.40,12.2,paint,1);
  part(a,'box',0,1.02,0,2.48,1.13,12.0,paint,1);
  part(a,'box',0,2.10,0,2.66,.17,12.3,[.64,.67,.63],1);
  part(a,'box',0,1.61,0,2.45,.88,11.9,GLASS,2);
  for(const x of [-1.257,1.257]) for(let z=-5;z<=5;z+=1.5) part(a,'box',x,1.62,z,.033,1.03,.095,paint,1);
  for(const x of [-1.278,1.278]) for(const z of [-3.65,3.65]) {
    a.doors.push(part(a,'box',x,1.08,z,.042,1.99,.72,[.55,.63,.58],1));
    part(a,'box',x*1.008,1.55,z,.048,.75,.56,GLASS,2);
  }
  for(const z of [-4.30,4.30]) for(const x of [-1.02,1.02]) part(a,'cylinder',x,-.19,z,.66,.24,.66,DARK,1,1,0,0,Math.PI/2);
  for(const z of [-6.06,6.06]) {
    part(a,'box',0,1.63,z,2.16,.74,.045,GLASS,2);
    part(a,'box',0,2.00,z*1.005,.91,.18,.038,[.69,.74,.37],6,2,0,0,0,.55);
    for(const x of [-.85,.85]) part(a,'box',x,.74,z*1.009,.23,.14,.025,[.86,.81,.53],6,1,0,0,0,.9);
  }
  part(a,'box',0,2.25,1.00,1.45,.16,2.95,[.35,.40,.38],1,2);
}

export class Population {
  constructor(world = {}, seed = world?.seed ?? 73191) {
    world = world && typeof world==='object' ? world : {};
    this.seed = seed; this.time = 0; this.disposed = false; this._random = random(seed);
    this._actors=[]; this._people=[]; this._traffic=[]; this._authored=[]; this._instances=[];
    this._player = isPoint(world.spawn?.position) ? [...world.spawn.position] : [0,0,0];
    this._environment={hour:10,weather:'clear'};
    this._foot=suppliedGraph(world,'foot'); this._road=suppliedGraph(world,'road'); this._air=suppliedGraph(world,'air');
    if (this._road.edges.length<3 && Array.isArray(world.roads)) { const fallback=roadsGraph(world); if(fallback.totalLength>this._road.totalLength) this._road=fallback; }
    this._footFallback=!this._foot.edges.length;
    if(this._footFallback) this._foot=this._road;
    this._targets = (Array.isArray(world.interactables)?world.interactables:[]).filter(t=>t&&isPoint(t.position));
    this._anchors={};
    for(const role of Object.keys(CLOTHES)) {
      const matches = role==='courier'?/drop|mara|transit|kiosk/:role==='worker'?/workshop|pump|rescue|orin|grid/:role==='security'?/archive|relay|service|transit/:role==='vendor'?/clinic|market|shop|kiosk|ivo|sana/:/home|garden|market|memorial|kiosk/;
      this._anchors[role]=this._targets.filter(t=>matches.test(t.id)).map(t=>nearest(this._foot,t.position)).filter(i=>i>=0);
    }
    for(const t of this._targets) if(AUTHORED[t.id]) {
      const a=this._base(t.id,'npc',AUTHORED[t.id]); a.authored=true; a.name=t.name||t.id; a.position[0]=t.position[0];a.position[1]=t.position[1];a.position[2]=t.position[2];a.home=[...a.position];
      const near=nearest(this._foot,a.position), p=near>=0?this._foot.nodes[near].p:this._player;
      a.yaw=Math.atan2(a.position[0]-p[0],a.position[2]-p[2]); a.restYaw=a.yaw;
      humanoid(a,this._random); this._people.push(a);this._authored.push(a);
    }
    const humanCount=this._foot.edges.length ? clamp(Math.floor(this._foot.totalLength/5),8,48) : 0;
    for(let i=0;i<humanCount;i++) {
      const a=this._base(`citizen-${i}`,'npc',ROLE_NAMES[i%ROLE_NAMES.length]);
      a.baseSpeed=.87+this._random()*.66; a.lane=(this._random()-.5)*.35;
      this._attach(a,this._foot); humanoid(a,this._random);this._people.push(a);
      for(let retry=0;retry<12&&this._authored.some(n=>distance(n.position,a.position)<2.7);retry++) this._attach(a,this._foot);
    }
    if(this._road.edges.length) for(let i=0;i<9;i++) {
      const kind=i<4?'car':i<7?'scooter':'van',a=this._base(`traffic-${i}`,kind,kind==='scooter'?'courier':'driver');
      a.baseSpeed=(kind==='scooter'?5.7:4.6)+this._random()*2.2;a.motor=true;
      this._attach(a,this._road);roadVehicle(a,this._random);this._traffic.push(a);
      // Distribute starts without interpenetrating an existing vehicle.
      for(let retry=0;retry<24&&this._traffic.some(b=>b!==a&&distance(a.position,b.position)<(a.length+b.length)*.5+1);retry++) this._attach(a,this._road);
    }
    if(this._foot.edges.length) for(let i=0;i<2;i++) {
      const a=this._base(`delivery-${i}`,'robot','delivery');a.baseSpeed=1.05+this._random()*.3;a.lane=.25;
      this._attach(a,this._foot);robot(a);this._traffic.push(a);
    }
    const flight=this._air.edges.length?this._air:this._road;
    if(flight.edges.length) for(let i=0;i<2;i++) {
      const a=this._base(`drone-${i}`,'drone','survey');a.baseSpeed=4.3+this._random()*1.9;a.altitude=this._air.edges.length?0:15+i*4;
      this._attach(a,flight);drone(a);this._traffic.push(a);
    }
    this._createTram(world.tramRoute||world.railRoute);
    for(const a of this._actors) this._pose(a);
    this._collect();
  }
  _base(id,kind,role) {
    const a={id,kind,role,name:role,index:this._actors.length,position:[0,0,0],yaw:0,cos:1,sin:0,parts:[],speed:0,baseSpeed:1,phase:this._random()*TAU,walkPhase:this._random()*TAU,accumulator:0,range:0,idleLeft:0,progress:0,path:[],segment:0,lane:0,sidestep:0,blockedFor:0,altitude:0,authored:false,motor:false,length:.6,width:.5};
    this._actors.push(a);return a;
  }
  _attach(a,g) {
    a.graph=g;a.node=g.active[Math.floor(this._random()*g.active.length)];this._plan(a);
    if(a.path.length>1) { const p=g.nodes[a.path[0]].p,q=g.nodes[a.path[1]].p;a.progress=this._random()*distance(p,q);this._position(a);a.yaw=a.targetYaw; }
  }
  _plan(a) {
    const g=a.graph,n=g.nodes[a.node];if(!n) return;
    const component=g.components[n.component];if(!component||component.length<2) {a.path=[a.node];return;}
    let to=-1;
    if(a.kind==='npc'&&this._random()<.67) {
      const candidates=this._anchors[a.role]||[];
      if(candidates.length) { const preferred=candidates[Math.floor((this._environment.hour/4+a.phase+this._random()*candidates.length))%candidates.length];if(g.nodes[preferred]?.component===n.component) to=preferred; }
    }
    if(to<0||to===a.node) { const offset=1+Math.floor(this._random()*(component.length-1));to=component[(component.indexOf(a.node)+offset)%component.length]; }
    a.path=shortest(g,a.node,to);a.segment=0;a.progress=0;
  }
  _position(a) {
    const g=a.graph,p=g.nodes[a.path[a.segment]]?.p,q=g.nodes[a.path[a.segment+1]]?.p;
    if(!p||!q) return;
    const dx=q[0]-p[0],dy=q[1]-p[1],dz=q[2]-p[2],length=Math.hypot(dx,dy,dz),horizontal=Math.hypot(dx,dz)||1;
    const t=clamp(a.progress/length,0,1),fade=clamp(Math.min(a.progress,length-a.progress)/3.5,0,1);
    let lane=a.lane+a.sidestep;
    if(a.motor) {const width=g.nodes[a.path[a.segment]].links.find(e=>e.to===a.path[a.segment+1])?.width||8;lane=clamp(width*.23,.65,2.4);}
    else if(this._footFallback&&(a.kind==='npc'||a.kind==='robot')) {const width=g.nodes[a.path[a.segment]].links.find(e=>e.to===a.path[a.segment+1])?.width||8;lane=Math.max(.55,width*.5-.75)+a.sidestep;}
    else if(a.kind==='drone')lane=0;
    a.position[0]=p[0]+dx*t-dz/horizontal*lane*fade;
    a.position[1]=p[1]+dy*t+a.altitude;
    a.position[2]=p[2]+dz*t+dx/horizontal*lane*fade;
    a.targetYaw=Math.atan2(-dx,-dz);a.edgeLength=length;
  }
  _reverse(a) {
    const from=a.path[a.segment],to=a.path[a.segment+1];if(from===undefined||to===undefined)return;
    const oldProgress=a.progress,len=distance(a.graph.nodes[from].p,a.graph.nodes[to].p);
    a.node=from;this._plan(a);a.path.unshift(to);a.segment=0;a.progress=Math.max(0,len-oldProgress);a.blockedFor=0;a.idleLeft=.5;
  }
  _walkAvoidance(a,dt) {
    let factor=1,side=0;const forwardX=-Math.sin(a.targetYaw),forwardZ=-Math.cos(a.targetYaw),rightX=Math.cos(a.targetYaw),rightZ=-Math.sin(a.targetYaw);
    for(const b of this._people) {
      if(b===a||Math.abs(b.position[1]-a.position[1])>1.3)continue;
      const dx=b.position[0]-a.position[0],dz=b.position[2]-a.position[2],d2=dx*dx+dz*dz;
      const radius=b.authored?2.6:1.5;if(d2>radius*radius)continue;
      const along=dx*forwardX+dz*forwardZ,lateral=dx*rightX+dz*rightZ;
      if(along>-.15&&Math.abs(lateral)<(b.authored?1.55:.68)) {
        side+=(lateral===0?(a.index%2?1:-1):-Math.sign(lateral))*(b.authored?1:.4)*(1-Math.sqrt(d2)/radius);
        if(b.authored&&d2<3.9) factor=Math.min(factor,clamp((Math.sqrt(d2)-1.55)*1.9,0,1));
        else if(d2<.85)factor=Math.min(factor,.23);
      }
    }
    const px=this._player[0]-a.position[0],pz=this._player[2]-a.position[2],pd=Math.hypot(px,pz);
    if(pd<2&&Math.abs(this._player[1]-a.position[1])<1.5&&px*forwardX+pz*forwardZ>-.2) {
      side+=(px*rightX+pz*rightZ>0?-1:1)*.7*(1-pd/2);factor=Math.min(factor,clamp((pd-.7)/.9,0,1));
    }
    const sidestepLimit=this._footFallback?.65:.34;
    a.sidestep+=(clamp(side,-sidestepLimit,sidestepLimit)-a.sidestep)*Math.min(1,dt*4);
    a.blockedFor=factor<.12?a.blockedFor+dt:Math.max(0,a.blockedFor-dt);
    if(a.blockedFor>3.2)this._reverse(a);
    return factor;
  }
  _trafficSpeed(a,desired) {
    a.maxStep=Infinity;
    const from=a.path[a.segment],to=a.path[a.segment+1];
    for(const b of this._traffic) {
      if(b===a||!b.motor||b.graph!==a.graph)continue;
      if(b.path[b.segment]===from&&b.path[b.segment+1]===to&&b.progress>a.progress) {
        const free=b.progress-a.progress-(a.length+b.length)*.5-1.35;
        desired=Math.min(desired,Math.max(0,free*1.45));a.maxStep=Math.min(a.maxStep,Math.max(0,free));
      } else if(a.edgeLength-a.progress<6&&b.path[b.segment+1]===to&&b.edgeLength-b.progress<6&&b.index<a.index&&b.speed>.15) {
        desired=Math.min(desired,Math.max(0,(a.edgeLength-a.progress-2.6)*1.3));
      }
    }
    const dx=this._player[0]-a.position[0],dz=this._player[2]-a.position[2];
    if(Math.abs(this._player[1]-a.position[1])<2) {
      const front=-Math.sin(a.yaw)*dx-Math.cos(a.yaw)*dz,side=Math.cos(a.yaw)*dx-Math.sin(a.yaw)*dz;
      if(front>0&&front<a.length*.5+4&&Math.abs(side)<a.width*.5+.6) {const free=Math.max(0,front-a.length*.5-1);desired=Math.min(desired,free*1.2);a.maxStep=Math.min(a.maxStep,free);}
    }
    return desired;
  }
  _move(a,dt) {
    if(a.idleLeft>0) {a.idleLeft=Math.max(0,a.idleLeft-dt);a.speed=0;return;}
    if(a.segment>=a.path.length-1) this._plan(a);
    if(a.path.length<2)return;
    let desired=a.baseSpeed*(this._environment.weather==='rain'?.86:1);
    if(a.kind==='npc'||a.kind==='robot')desired*=this._walkAvoidance(a,dt);
    if(a.motor)desired=this._trafficSpeed(a,desired);
    a.speed+=(desired-a.speed)*Math.min(1,dt*(desired<a.speed?7:2.2));
    let travel=a.speed*dt;if(a.motor)travel=Math.min(travel,a.maxStep);
    for(let crossings=0;travel>0&&crossings<8;crossings++) {
      const p=a.graph.nodes[a.path[a.segment]]?.p,q=a.graph.nodes[a.path[a.segment+1]]?.p;if(!p||!q)break;
      const length=distance(p,q),remaining=length-a.progress;
      if(travel<remaining) {a.progress+=travel;break;}
      travel-=Math.max(0,remaining);a.progress=length;this._position(a);a.node=a.path[a.segment+1];a.segment++;a.progress=0;
      if(a.segment>=a.path.length-1) {a.idleLeft=a.kind==='npc'?(1.2+this._random()*5.5)*(this._environment.hour<6?1.5:1):a.kind==='drone'?.5:1.3+this._random()*3;a.speed=0;break;}
      if(a.motor&&a.graph.nodes[a.node].links.length>=3&&this._random()<.28) {a.idleLeft=.35+this._random()*.95;a.speed=0;break;}
    }
    this._position(a);a.yaw=turn(a.yaw,a.targetYaw,dt*(a.motor?3.6:6));a.walkPhase+=a.speed*dt*4.6;
  }
  _createTram(route) {
    const source=Array.isArray(route)?route:route?.points;if(!Array.isArray(source))return;
    const points=source.filter(isPoint).slice(0,128).map(p=>[p[0],p[1],p[2]]);if(points.length<2)return;
    const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+distance(points[i-1],points[i]));
    const total=lengths.at(-1);if(total<20)return;
    const stops=[0,total];
    for(const raw of Array.isArray(route?.stops)?route.stops:[]) {
      const p=isPoint(raw)?raw:raw?.position;if(!isPoint(p))continue;let best=Infinity,at=0;
      for(let i=1;i<points.length;i++) {const u=points[i-1],v=points[i],dx=v[0]-u[0],dy=v[1]-u[1],dz=v[2]-u[2],len=lengths[i]-lengths[i-1];if(len<.01)continue;const t=clamp(((p[0]-u[0])*dx+(p[1]-u[1])*dy+(p[2]-u[2])*dz)/(len*len),0,1),d=(u[0]+dx*t-p[0])**2+(u[1]+dy*t-p[1])**2+(u[2]+dz*t-p[2])**2;if(d<best){best=d;at=lengths[i-1]+len*t;}}
      if(best<100)stops.push(at);
    }
    stops.sort((a,b)=>a-b);const a=this._base('tram','tram','transit');a.rail={points,lengths,total,stops:stops.filter((v,i)=>!i||v-stops[i-1]>2),at:0,direction:1,stopIndex:0,targetIndex:1};a.idleLeft=6;this._tramPosition(a);tramBody(a);this._traffic.push(a);
  }
  _tramPosition(a) {
    const r=a.rail;let i=1;while(i<r.lengths.length-1&&r.at>r.lengths[i])i++;
    const p=r.points[i-1],q=r.points[i],t=clamp((r.at-r.lengths[i-1])/(r.lengths[i]-r.lengths[i-1]||1),0,1);
    for(let k=0;k<3;k++)a.position[k]=p[k]+(q[k]-p[k])*t;
    a.yaw=Math.atan2(-(q[0]-p[0])*r.direction,-(q[2]-p[2])*r.direction);
  }
  _moveTram(a,dt) {
    const r=a.rail;
    if(a.idleLeft>0) {a.idleLeft=Math.max(0,a.idleLeft-dt);a.speed=0;return;}
    const remaining=Math.abs(r.stops[r.targetIndex]-r.at),desired=Math.min(7.8,Math.sqrt(remaining*2.4));
    a.speed=Math.min(desired,a.speed+dt*1.1);const amount=Math.min(remaining,a.speed*dt+.002);
    r.at+=amount*r.direction;
    if(remaining<=amount+.03) {r.at=r.stops[r.targetIndex];r.stopIndex=r.targetIndex;if(r.stopIndex===0)r.direction=1;else if(r.stopIndex===r.stops.length-1)r.direction=-1;r.targetIndex=r.stopIndex+r.direction;a.idleLeft=6;a.speed=0;}
    this._tramPosition(a);
  }
  _recover(a) {
    if(!a.position||a.position.length<3)a.position=[0,0,0];
    if(a.authored) {a.position[0]=a.home[0];a.position[1]=a.home[1];a.position[2]=a.home[2];a.yaw=a.restYaw;}
    else if(a.rail) {a.rail.at=0;a.rail.direction=1;a.rail.targetIndex=1;this._tramPosition(a);}
    else if(a.graph?.active.length)this._attach(a,a.graph);
    a.speed=0;a.walkPhase=a.phase;a.sidestep=0;a.accumulator=0;
  }
  _pose(a) {
    a.cos=Math.cos(a.yaw);a.sin=Math.sin(a.yaw);
    for(const p of a.parts)local(a,p);
    if(a.human)poseHuman(a,this.time);
    if(a.rotors)for(let i=0;i<a.rotors.length;i++) {const p=a.rotors[i];local(a,p,p.x,p.y+Math.sin(this.time*3+a.phase)*.025,p.z,0,this.time*(i%2?42:-42),0);}
    if(a.doors)for(const p of a.doors)local(a,p,p.x,p.y,p.z+(a.idleLeft>1?.57:0));
  }
  _collect() {
    this._instances.length=0;
    for(const a of this._actors) {
      if(a.range>290&&!a.authored&&a.kind!=='tram'&&a.kind!=='drone')continue;
      const detail=a.range>110?1:2;
      for(const p of a.parts)if(p.detail<=detail)this._instances.push(p.instance);
    }
  }
  update(dt,player={},environment={}) {
    if(this.disposed)return;
    dt=Number.isFinite(dt)?clamp(dt,0,.25):0;
    if(isPoint(player?.position))for(let i=0;i<3;i++)this._player[i]=player.position[i];
    this._environment.hour=Number.isFinite(environment?.hour)?((environment.hour%24)+24)%24:this._environment.hour;
    this._environment.weather=environment?.weather||'clear';this.time+=dt;
    for(const a of this._actors) {
      if(!isPoint(a.position)||!Number.isFinite(a.yaw)||!Number.isFinite(a.progress)||!Number.isFinite(a.speed)||(a.targetYaw!==undefined&&!Number.isFinite(a.targetYaw)))this._recover(a);
      if(a.graph&&(!a.graph.nodes[a.node]||(a.segment<a.path.length-1&&(!a.graph.nodes[a.path[a.segment]]||!a.graph.nodes[a.path[a.segment+1]]))))this._recover(a);
      a.range=distance(a.position,this._player);a.accumulator+=dt;
      const interval=a.authored||a.range<52?0:a.range<130?.09:.32;
      if(a.accumulator<interval)continue;
      const step=Math.min(.5,a.accumulator);a.accumulator=0;
      if(a.authored) {
        const dx=this._player[0]-a.position[0],dz=this._player[2]-a.position[2];
        const desired=a.range<7?Math.atan2(-dx,-dz):a.restYaw+Math.sin(this.time*.22+a.phase)*.13;
        a.yaw=turn(a.yaw,desired,step*1.7);
      } else if(a.rail)this._moveTram(a,step);else this._move(a,step);
      this._pose(a);
    }
    this._collect();
  }
  instances() { return this._instances; }
  getStats() { return {npcCount:this._people.length,trafficCount:this._traffic.length}; }
  spawn(role='resident',position=this._player) {
    if(this.disposed)return {ok:false,message:'Population is disposed.'};
    if(this._people.length>=128)return {ok:false,message:'Population limit reached (128 people).'};
    if(!this._foot?.active.length)return {ok:false,message:'No connected pedestrian route is available.'};
    role=typeof role==='string'&&Object.prototype.hasOwnProperty.call(CLOTHES,role)?role:'resident';
    const requested=isPoint(position)?position:this._player;
    let at=-1,best=Infinity;
    for(const i of this._foot.active) {
      const p=this._foot.nodes[i].p;
      if(this._authored.some(a=>distance(a.position,p)<2))continue;
      const d=(p[0]-requested[0])**2+(p[2]-requested[2])**2+9*(p[1]-requested[1])**2;
      if(d<best){best=d;at=i;}
    }
    if(at<0)return {ok:false,message:'Pedestrian route is occupied by interaction characters.'};
    const a=this._base(`citizen-spawn-${this._actors.length}`,'npc',role);
    a.graph=this._foot;a.node=at;a.baseSpeed=.87+this._random()*.66;a.lane=(this._random()-.5)*.35;
    this._plan(a);this._position(a);a.yaw=a.targetYaw;a.range=distance(a.position,this._player);
    humanoid(a,this._random);this._people.push(a);this._pose(a);this._collect();
    return {ok:true,message:`Spawned ${role} on a pedestrian route.`,id:a.id,role,position:[...a.position]};
  }
  nearby(position,radius=4) {
    if(this.disposed||!isPoint(position)||!Number.isFinite(radius)||radius<0)return [];
    const result=[];
    for(const a of this._actors) {const d=distance(position,a.position);if(d<=radius)result.push({id:a.id,type:a.kind==='npc'?'npc':'vehicle',kind:a.kind,role:a.role,name:a.name,position:[...a.position],yaw:a.yaw,speed:a.speed,authored:a.authored,distance:d});}
    result.sort((a,b)=>a.distance-b.distance);return result;
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;
    for(const a of this._actors){a.parts.length=0;a.path.length=0;}
    this._actors.length=0;this._people.length=0;this._traffic.length=0;this._authored.length=0;this._instances.length=0;this._targets.length=0;this._anchors={};
    this._foot=null;this._road=null;this._air=null;
  }
}
