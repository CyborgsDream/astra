import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireGPUDevice} from '../src/engine/gpu-device.js';

test('native device selection retries a browser-default adapter when a power preference is unavailable',async()=>{
  const calls=[];const device={};
  const gpu={requestAdapter:async options=>{calls.push(options);return options?null:{features:new Set(),requestDevice:async()=>device};}};
  const result=await acquireGPUDevice(gpu);
  assert.equal(result.device,device);
  assert.equal(result.selection,'browser-default');
  assert.equal(calls.length,2);
  assert.equal(result.timestampsSupported,false);
});

test('optional timing failure reacquires an adapter and permits a featureless native device',async()=>{
  const descriptors=[];let adapters=0;const device={};
  const gpu={requestAdapter:async()=>{const id=++adapters;return {features:new Set(['timestamp-query']),requestDevice:async descriptor=>{descriptors.push(descriptor);if(id===1)throw new Error('Optional timing refused');return device;}};}};
  const result=await acquireGPUDevice(gpu);
  assert.equal(adapters,2);
  assert.deepEqual(descriptors.map(d=>d.requiredFeatures),[['timestamp-query'],[]]);
  assert.equal(result.device,device);
  assert.equal(result.timestampsSupported,false);
});

test('adapter exceptions and null responses produce a bounded actionable error',async()=>{
  let calls=0;
  await assert.rejects(acquireGPUDevice({requestAdapter:async()=>{calls++;if(calls===1)throw new Error('GPU unavailable');return null;}}),error=>{
    assert.match(error.message,/WebGPU graphics device/);
    assert.equal(error.attempts.length,3);
    return true;
  });
  assert.equal(calls,3);
});

test('absence of WebGPU fails before attempting canvas setup',async()=>{
  await assert.rejects(acquireGPUDevice(null),/WebGPU/);
});
