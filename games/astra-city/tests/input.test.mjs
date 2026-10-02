import test from 'node:test';
import assert from 'node:assert/strict';
import {PlayerInput} from '../src/engine/input.js';

test('a late pointer-lock grant cannot capture a conversation or pause panel',async()=>{
  const saved={window:globalThis.window,document:globalThis.document,matchMedia:globalThis.matchMedia};
  let grant,exits=0;
  const canvas=new EventTarget();
  canvas.requestPointerLock=()=>new Promise(resolve=>{grant=()=>{document.pointerLockElement=canvas;document.dispatchEvent(new Event('pointerlockchange'));resolve();};});
  globalThis.window=new EventTarget();
  globalThis.document=Object.assign(new EventTarget(),{pointerLockElement:null,getElementById:()=>null,exitPointerLock(){exits++;this.pointerLockElement=null;this.dispatchEvent(new Event('pointerlockchange'));}});
  globalThis.matchMedia=()=>({matches:false});
  try {
    const input=new PlayerInput(canvas);
    input.enabled=true;
    const pending=input.requestLock();
    input.enabled=false;input.release();
    grant();await pending;
    assert.equal(document.pointerLockElement,null);
    assert.equal(input.pointer,false);
    assert.equal(input.lockPending,false);
    assert.equal(exits,1);
    input.destroy();
  } finally {
    for(const [name,value] of Object.entries(saved)){if(value===undefined)delete globalThis[name];else globalThis[name]=value;}
  }
});
