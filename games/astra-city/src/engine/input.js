export class PlayerInput {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.keys = new Set();
    this.enabled = false;
    this.pointer = false;
    this.wantsPointer = false;
    this.lockPending = false;
    this.dragging = false;
    this.mobile = matchMedia('(pointer:coarse)').matches;
    this.touchMove = [0, 0];
    this.touchFlags = {};
    this.abort = new AbortController();
    const on = (el, event, handler, options = {}) => el.addEventListener(event, handler, {...options, signal: this.abort.signal});
    on(window, 'keydown', e => {
      if (e.target.matches('input,textarea,select')) return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) callbacks.press?.(e.code, e);
      this.keys.add(e.code);
    });
    on(window, 'keyup', e => this.keys.delete(e.code));
    on(window, 'blur', () => {this.keys.clear(); this.touchMove = [0, 0]; this.touchFlags = {}; callbacks.blur?.();});
    on(document, 'pointerlockchange', () => {
      if(document.pointerLockElement===canvas && (!this.enabled || !this.wantsPointer)) {
        this.pointer=false;document.exitPointerLock();return;
      }
      const was = this.pointer;
      this.pointer = document.pointerLockElement === canvas;
      if (was && !this.pointer) {this.wantsPointer=false;callbacks.unlock?.();}
    });
    on(canvas, 'pointerdown', e => {
      if (!this.enabled || e.pointerType === 'touch') return;
      if (e.button === 0) { this.dragging = true; this.requestLock(); }
    });
    on(window, 'pointerup', () => {this.dragging = false;});
    on(window, 'mousemove', e => { if (this.enabled && (this.pointer || this.dragging)) callbacks.look?.(e.movementX, e.movementY); });
    on(canvas, 'contextmenu', e => e.preventDefault());
    this.bindTouch(on);
  }

  bindTouch(on) {
    const move = document.getElementById('touch-move');
    if (move) {
      let origin = null, touchId = null;
      on(move, 'pointerdown', e => {
        if (!this.enabled) return;
        e.preventDefault();
        touchId = e.pointerId;
        origin = [e.clientX, e.clientY];
        move.setPointerCapture(e.pointerId);
      });
      on(move, 'pointermove', e => {
        if (e.pointerId !== touchId || !origin) return;
        const x = (e.clientX - origin[0]) / 42, z = (e.clientY - origin[1]) / 42, m = Math.max(1, Math.hypot(x, z));
        this.touchMove = [x / m, -z / m];
        move.style.setProperty('--stick-x', `${this.touchMove[0] * 28}px`);
        move.style.setProperty('--stick-y', `${-this.touchMove[1] * 28}px`);
      });
      const end = () => {origin = null; touchId = null; this.touchMove = [0, 0]; move.style.setProperty('--stick-x', '0px'); move.style.setProperty('--stick-y', '0px');};
      on(move, 'pointerup', end); on(move, 'pointercancel', end);
    }
    const look = document.getElementById('touch-look');
    if (look) {
      let previous = null, id = null;
      on(look, 'pointerdown', e => {if (!this.enabled) return; e.preventDefault(); previous = [e.clientX, e.clientY]; id = e.pointerId; look.setPointerCapture(id);});
      on(look, 'pointermove', e => {if (!previous || id !== e.pointerId) return; this.callbacks.look?.((e.clientX - previous[0]) * 1.6, (e.clientY - previous[1]) * 1.6); previous = [e.clientX, e.clientY];});
      on(look, 'pointerup', () => {previous = null; id = null;});
      on(look, 'pointercancel', () => {previous = null; id = null;});
    }
    for (const [name, code] of [['jump', 'Space'], ['sprint', 'ShiftLeft'], ['crouch', 'ControlLeft']]) {
      const el = document.getElementById(`touch-${name}`);
      if (!el) continue;
      on(el, 'pointerdown', e => {e.preventDefault(); this.touchFlags[code] = true; this.callbacks.press?.(code, e); el.setPointerCapture(e.pointerId);});
      const up = () => {this.touchFlags[code] = false;};
      on(el, 'pointerup', up); on(el, 'pointercancel', up);
    }
  }

  state() {
    const down = (...keys) => keys.some(k => this.keys.has(k) || this.touchFlags[k]);
    return {
      forward: this.enabled ? (down('KeyW', 'ArrowUp') ? 1 : 0) - (down('KeyS', 'ArrowDown') ? 1 : 0) + this.touchMove[1] : 0,
      right: this.enabled ? (down('KeyD') ? 1 : 0) - (down('KeyA') ? 1 : 0) + this.touchMove[0] : 0,
      turn: this.enabled ? (down('ArrowLeft') ? 1 : 0) - (down('ArrowRight') ? 1 : 0) : 0,
      sprint: this.enabled && down('ShiftLeft', 'ShiftRight'),
      crouch: this.enabled && down('ControlLeft', 'ControlRight', 'KeyC'),
      jumpHeld: this.enabled && down('Space')
    };
  }

  async requestLock() {
    if (!this.enabled || this.mobile || this.pointer) return;
    this.wantsPointer=true;
    if(this.lockPending)return;
    this.lockPending=true;
    try { await this.canvas.requestPointerLock?.({unadjustedMovement: true}); }
    catch {
      if(this.enabled && this.wantsPointer) {
        try { await this.canvas.requestPointerLock?.(); }
        catch {if(this.enabled && this.wantsPointer)this.callbacks.lockUnavailable?.();}
      }
    } finally {
      this.lockPending=false;
      // A menu can open while the browser is still granting capture.
      if((!this.enabled || !this.wantsPointer) && document.pointerLockElement===this.canvas)document.exitPointerLock();
    }
  }

  release() {this.wantsPointer=false;this.dragging=false;this.keys.clear(); this.touchMove = [0, 0]; this.touchFlags = {}; if (document.pointerLockElement === this.canvas) document.exitPointerLock();}
  destroy() {this.enabled=false;this.abort.abort(); this.release();}
}
