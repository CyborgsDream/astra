/** Acquire a fresh WebGPU adapter for each device attempt. Optional telemetry must never prevent play. */
export async function acquireGPUDevice(gpu=globalThis.navigator?.gpu) {
  if(!gpu || typeof gpu.requestAdapter!=='function') {
    throw new Error(globalThis.isSecureContext===false
      ? 'WebGPU needs a secure connection. Open this game over HTTPS or localhost.'
      : 'This browser does not expose WebGPU. Use a browser and graphics device with WebGPU enabled.');
  }
  const attempts=[];
  const preferences=[{powerPreference:'high-performance'},undefined,{powerPreference:'low-power'}];
  for(const preference of preferences) {
    const label=preference?.powerPreference || 'browser-default';
    let adapter;
    try { adapter=await gpu.requestAdapter(preference); }
    catch(error) { attempts.push(`${label}: ${error?.message || error}`); continue; }
    if(!adapter){attempts.push(`${label}: no adapter`);continue;}
    const timestamps=Boolean(adapter.features?.has('timestamp-query'));
    try {
      const device=await adapter.requestDevice({label:'ASTRA CITY native WebGPU device',requiredFeatures:timestamps?['timestamp-query']:[]});
      return {adapter,device,timestampsSupported:timestamps,attempts,selection:label};
    } catch(error) {attempts.push(`${label}: ${error?.message || error}`);}
    if(timestamps) {
      // A successfully created adapter is consumed. Always reacquire, including after a rejected optional request.
      try {
        adapter=await gpu.requestAdapter(preference);
        if(!adapter)continue;
        const device=await adapter.requestDevice({label:'ASTRA CITY native WebGPU device',requiredFeatures:[]});
        return {adapter,device,timestampsSupported:false,attempts,selection:label};
      } catch(error) {attempts.push(`${label} without optional timing: ${error?.message || error}`);}
    }
  }
  const failure=new Error('The browser could not acquire a WebGPU graphics device. Check that graphics acceleration and WebGPU are available, then retry.');
  failure.attempts=attempts;
  throw failure;
}
