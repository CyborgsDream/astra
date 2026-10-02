const EPS = 0.002;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const finite3 = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);

export class CollisionWorld {
  constructor(colliders = [], ramps = [], cellSize = 8) {
    this.colliders = colliders;
    this.ramps = ramps;
    this.cellSize = cellSize;
    this.grid = new Map();
    this.disabled = new Set();
    this.queries = 0;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (!finite3(c.min) || !finite3(c.max)) throw new Error(`Invalid collision geometry: ${c.id || i}`);
      for (let x = Math.floor(c.min[0] / cellSize); x <= Math.floor(c.max[0] / cellSize); x++) {
        for (let z = Math.floor(c.min[2] / cellSize); z <= Math.floor(c.max[2] / cellSize); z++) {
          const key = `${x},${z}`;
          if (!this.grid.has(key)) this.grid.set(key, []);
          this.grid.get(key).push(i);
        }
      }
    }
  }

  setOpen(ids) { this.disabled = new Set(ids || []); }

  query(x, z, radius = 1) {
    this.queries++;
    const found = new Set();
    const out = [];
    for (let a = Math.floor((x - radius) / this.cellSize); a <= Math.floor((x + radius) / this.cellSize); a++) {
      for (let b = Math.floor((z - radius) / this.cellSize); b <= Math.floor((z + radius) / this.cellSize); b++) {
        for (const i of this.grid.get(`${a},${b}`) || []) {
          if (found.has(i)) continue;
          found.add(i);
          const c = this.colliders[i];
          if (this.disabled.has(c.owner) || this.disabled.has(c.id)) continue;
          out.push(c);
        }
      }
    }
    return out;
  }

  horizontalOverlap(position, c, radius) {
    return position[0] + radius > c.min[0] + EPS && position[0] - radius < c.max[0] - EPS &&
      position[2] + radius > c.min[2] + EPS && position[2] - radius < c.max[2] - EPS;
  }

  blocked(position, radius = 0.32, height = 1.76) {
    return this.query(position[0], position[2], radius).some(c =>
      this.horizontalOverlap(position, c, radius) && position[1] + height > c.min[1] + EPS && position[1] < c.max[1] - EPS);
  }

  rampHeight(r, x, z, margin = 0) {
    if (x < r.x - r.width / 2 - margin || x > r.x + r.width / 2 + margin ||
        z < r.z - r.depth / 2 - margin || z > r.z + r.depth / 2 + margin) return null;
    const t = r.axis === 'x' ? (x - r.x + r.width / 2) / r.width : (z - r.z + r.depth / 2) / r.depth;
    return r.y0 + (r.y1 - r.y0) * clamp(t, 0, 1);
  }

  floorAt(position, radius = 0.32, maxRise = 0.42, maxDrop = 0.6) {
    let floor = -Infinity;
    for (const c of this.query(position[0], position[2], radius)) {
      if (this.horizontalOverlap(position, c, radius) && c.max[1] <= position[1] + maxRise + EPS && c.max[1] >= position[1] - maxDrop) {
        floor = Math.max(floor, c.max[1]);
      }
    }
    for (const r of this.ramps) {
      const y = this.rampHeight(r, position[0], position[2]);
      if (y !== null && y <= position[1] + maxRise && y >= position[1] - maxDrop) floor = Math.max(floor, y);
    }
    return floor;
  }

  move(position, velocity, dt, {radius = .32, height = 1.76, stepHeight = .42, grounded = false} = {}) {
    const result = {grounded: false, ceiling: false, hit: false, impact: 0};
    const steps = Math.max(1, Math.ceil(dt / (1 / 100)), Math.ceil(Math.hypot(velocity[0], velocity[2]) * dt / .22));
    const h = dt / steps;
    for (let sub = 0; sub < steps; sub++) {
      for (const axis of [0, 2]) {
        const old = position[axis];
        position[axis] += velocity[axis] * h;
        const candidates = this.query(position[0], position[2], radius + .05);
        for (const c of candidates) {
          if (!this.horizontalOverlap(position, c, radius) || position[1] + height <= c.min[1] + EPS || position[1] >= c.max[1] - EPS) continue;
          if ((grounded || result.grounded) && c.max[1] <= position[1] + stepHeight && c.max[1] > position[1] &&
              !this.blocked([position[0], c.max[1] + EPS, position[2]], radius, height)) {
            position[1] = c.max[1] + EPS;
            result.grounded = true;
            continue;
          }
          result.hit = true;
          if (velocity[axis] > 0 && old + radius <= c.min[axis] + .25) position[axis] = Math.min(position[axis], c.min[axis] - radius);
          else if (velocity[axis] < 0 && old - radius >= c.max[axis] - .25) position[axis] = Math.max(position[axis], c.max[axis] + radius);
          else position[axis] = old;
        }
      }
      const previousY = position[1];
      let nextY = previousY + velocity[1] * h;
      const candidates = this.query(position[0], position[2], radius + .05);
      for (const c of candidates) {
        if (!this.horizontalOverlap(position, c, radius)) continue;
        if (velocity[1] <= 0 && previousY >= c.max[1] - EPS && nextY < c.max[1] + EPS) {
          nextY = Math.max(nextY, c.max[1]);
          result.impact = Math.max(result.impact, -velocity[1]);
          velocity[1] = 0;
          result.grounded = true;
        } else if (velocity[1] > 0 && previousY + height <= c.min[1] + EPS && nextY + height > c.min[1]) {
          nextY = Math.min(nextY, c.min[1] - height - EPS);
          velocity[1] = 0;
          result.ceiling = true;
        }
      }
      position[1] = nextY;
      if (velocity[1] <= 0) {
        const rampOrStep = this.floorAt(position, radius, (grounded || result.grounded) ? stepHeight : .04, (grounded || result.grounded) ? .52 : .06);
        if (Number.isFinite(rampOrStep) && (grounded || result.grounded || position[1] >= rampOrStep - .04)) {
          const lifted = [position[0], rampOrStep + EPS, position[2]];
          if (!this.blocked(lifted, radius, height)) {
            position[1] = rampOrStep;
            velocity[1] = 0;
            result.grounded = true;
          }
        }
      }
      grounded = result.grounded;
    }
    return result;
  }

  canTraverse(from, to, radius = .32, height = 1.76) {
    if (!finite3(from) || !finite3(to)) return false;
    const reach = Math.hypot(to[0]-from[0],to[2]-from[2]) / 2 + radius;
    const candidates = this.query((from[0]+to[0])/2,(from[2]+to[2])/2,reach);
    for (const c of candidates) {
      // A moving standing capsule uses the same conservative horizontal bounds
      // as normal movement. Expand obstacles by the capsule, then sweep a point.
      const min=[c.min[0]-radius+EPS,c.min[1]-height+EPS,c.min[2]-radius+EPS];
      const max=[c.max[0]+radius-EPS,c.max[1]-EPS,c.max[2]+radius-EPS];
      let enter=0,leave=1;
      for(let axis=0;axis<3;axis++) {
        const delta=to[axis]-from[axis];
        if(Math.abs(delta)<1e-9) {if(from[axis]<min[axis]||from[axis]>max[axis]){leave=-1;break;}}
        else {const a=(min[axis]-from[axis])/delta,b=(max[axis]-from[axis])/delta;enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));if(enter>leave)break;}
      }
      if(enter<=leave)return false;
    }
    return true;
  }

  lineOfSight(from, to) {
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    const length = Math.hypot(dx, dy, dz);
    const steps = Math.max(1, Math.ceil(length / 3));
    const candidates = new Set();
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      for (const c of this.query(from[0] + dx * t, from[2] + dz * t, .1)) candidates.add(c);
    }
    for (const c of candidates) {
      let t0 = .02, t1 = .98;
      for (let axis = 0; axis < 3; axis++) {
        const d = to[axis] - from[axis];
        if (Math.abs(d) < 1e-7) {
          if (from[axis] < c.min[axis] || from[axis] > c.max[axis]) { t1 = -1; break; }
        } else {
          const a = (c.min[axis] - from[axis]) / d, b = (c.max[axis] - from[axis]) / d;
          t0 = Math.max(t0, Math.min(a, b));
          t1 = Math.min(t1, Math.max(a, b));
          if (t0 > t1) break;
        }
      }
      if (t0 <= t1) return false;
    }
    return true;
  }
}

export class PlayerController {
  constructor(collision, spawn) {
    this.collision = collision;
    this.position = [...spawn.position];
    this.yaw = spawn.yaw || 0;
    this.pitch = spawn.pitch || 0;
    this.velocity = [0, 0, 0];
    this.grounded = false;
    this.crouched = false;
    this.height = 1.76;
    this.eyeHeight = 1.62;
    this.walkClock = 0;
    this.speed = 0;
    this.riding = false;
    this.freeCamera = false;
    this.travel = null;
    this.checkpoint = [...spawn.position];
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.impact = 0;
    this.lastSafe = [...spawn.position];
  }

  restore(player) {
    if (finite3(player.position)) this.position = [...player.position];
    if (Number.isFinite(player.yaw)) this.yaw = player.yaw;
    if (Number.isFinite(player.pitch)) this.pitch = clamp(player.pitch, -1.45, 1.45);
    this.velocity = [0, 0, 0];
    this.travel = null;
    this.riding = false;
    this.grounded = false;
    this.crouched = false;
    this.height = 1.76;
    this.eyeHeight = 1.62;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.impact = 0;
    this.speed = 0;
    this.walkClock = 0;
    this.lastSafe = [...this.position];
  }

  look(dx, dy, sensitivity = 1, invertY = false) {
    this.yaw -= dx * .0022 * sensitivity;
    this.pitch = clamp(this.pitch - dy * .0022 * sensitivity * (invertY ? -1 : 1), -1.45, 1.45);
  }

  jump() { this.jumpBuffer = .18; }

  mantle() {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const ahead = [this.position[0] + fx * .85, this.position[1], this.position[2] + fz * .85];
    for (const c of this.collision.query(ahead[0], ahead[2], .45)) {
      if (c.max[1] < this.position[1] + .3 || c.max[1] > this.position[1] + 1.35 ||
          !this.collision.horizontalOverlap(ahead, c, .28)) continue;
      const target = [ahead[0], c.max[1] + EPS, ahead[2]];
      if (!this.collision.blocked(target, .28, this.height)) {
        this.moveTo(target, .4, 'mantle');
        return true;
      }
    }
    return false;
  }

  moveTo(target, duration = 1.2, mode = 'travel') {
    if (!finite3(target)) return false;
    this.travel = {from: [...this.position], to: [...target], elapsed: 0, duration: Math.max(.05, duration), mode};
    this.velocity.fill(0);
    return true;
  }

  moveAlongPath(points, duration = 1.2, mode = 'ladder') {
    if(!Array.isArray(points)||!points.length||!points.every(finite3))return false;
    const path=[[...this.position]],lengths=[0];
    for(const point of points) {
      const from=path.at(-1),length=Math.hypot(...point.map((v,i)=>v-from[i]));
      if(length<.001)continue;
      if(!this.collision.canTraverse(from,point,.32,1.76))return false;
      path.push([...point]);lengths.push(lengths.at(-1)+length);
    }
    if(path.length<2)return false;
    const destination=path.at(-1),floor=this.collision.floorAt(destination,.32,.05,.15);
    if(!Number.isFinite(floor)||Math.abs(floor-destination[1])>.05||this.collision.blocked(destination,.32,1.76))return false;
    this.travel={from:[...this.position],to:[...destination],path,lengths,total:lengths.at(-1),elapsed:0,duration:Math.max(.05,duration),mode};
    this.velocity.fill(0);this.speed=0;this.grounded=false;this.riding=false;this.crouched=false;this.height=1.76;this.eyeHeight=1.62;
    return true;
  }

  update(dt, input, state) {
    this.impact = 0;
    if (this.travel) {
      const t = this.travel;
      t.elapsed += dt;
      const a = clamp(t.elapsed / t.duration, 0, 1), u = a * a * (3 - 2 * a);
      if(t.path) {
        const distance=t.total*u;let segment=1;
        while(segment<t.path.length-1&&distance>t.lengths[segment])segment++;
        const ratio=clamp((distance-t.lengths[segment-1])/(t.lengths[segment]-t.lengths[segment-1]||1),0,1);
        this.position=t.path[segment-1].map((v,i)=>v+(t.path[segment][i]-v)*ratio);
      } else this.position = t.from.map((v, i) => v + (t.to[i] - v) * u);
      if (t.mode === 'mantle') this.position[1] += Math.sin(a * Math.PI) * .2;
      if (a >= 1) { this.travel = null; this.lastSafe = [...this.position]; }
      this.speed = 0;
      return;
    }
    this.coyote = this.grounded ? .12 : Math.max(0, this.coyote - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    const equipment = state.player.equipment || [];
    const boots = equipment.includes('runner_soles');
    const requestedCrouch = input.crouch && !this.riding;
    if (requestedCrouch) this.crouched = true;
    else if (!this.collision.blocked(this.position, .32, 1.76)) this.crouched = false;
    this.height = this.crouched ? 1.04 : 1.76;
    this.eyeHeight += ((this.crouched ? .9 : this.riding ? 1.25 : 1.62) - this.eyeHeight) * Math.min(1, dt * 12);
    let sprint = input.sprint && state.player.energy > 3 && !this.crouched;
    const walkSpeed = this.riding ? (sprint ? 15 : 11) : this.crouched ? 1.7 : sprint ? (boots ? 7.6 : 6.3) : 3.8;
    const length = Math.max(1, Math.hypot(input.forward, input.right));
    const f = input.forward / length, r = input.right / length;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let vx = (fx * f + rx * r) * walkSpeed, vz = (fz * f + rz * r) * walkSpeed;
    const acceleration = this.riding ? 2.8 : this.grounded ? 17 : 6;
    this.velocity[0] += (vx - this.velocity[0]) * Math.min(1, dt * acceleration);
    this.velocity[2] += (vz - this.velocity[2]) * Math.min(1, dt * acceleration);
    if (this.freeCamera) {
      const up = (input.jumpHeld ? 1 : 0) - (input.crouch ? 1 : 0);
      this.position[0] += this.velocity[0] * dt * 3;
      this.position[2] += this.velocity[2] * dt * 3;
      this.position[1] += up * dt * 14;
      this.velocity[1] = 0;
      return;
    }
    if (this.jumpBuffer > 0 && this.coyote > 0 && !this.riding) {
      this.velocity[1] = boots ? 7.5 : 6.6;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
    } else if (this.jumpBuffer > 0 && !this.riding && input.forward > .2 && this.mantle()) this.jumpBuffer = 0;
    this.velocity[1] = Math.max(-30, this.velocity[1] - 19 * dt);
    const result = this.collision.move(this.position, this.velocity, dt, {height: this.height, radius: this.riding ? .5 : .32, grounded: this.grounded});
    this.grounded = result.grounded;
    this.impact = result.impact;
    this.speed = Math.hypot(this.velocity[0], this.velocity[2]);
    if (this.grounded && this.speed > .15) this.walkClock += dt * this.speed;
    if (sprint && this.speed > 2 && !this.riding) state.player.energy = Math.max(0, state.player.energy - dt * 6);
    if (this.grounded && this.position[1] > -20 && !this.collision.blocked(this.position, .31, this.height)) this.lastSafe = [...this.position];
    if (!this.position.every(Number.isFinite) || this.position[1] < -26) {
      this.position = [...this.checkpoint];
      this.velocity.fill(0);
      this.impact = 0;
    }
  }

  camera(fov = 75) {
    const bob = this.grounded && !this.riding && !this.travel ? Math.sin(this.walkClock * 2.2) * .019 * Math.min(1, this.speed / 3.8) : 0;
    return {position: [this.position[0], this.position[1] + this.eyeHeight + bob, this.position[2]], yaw: this.yaw, pitch: this.pitch, fov, near: .06, far: 950};
  }
}
