import {chromium} from 'playwright-core';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'test-results/views');
await mkdir(output,{recursive:true});
const port=Number(process.env.ASTRA_TEST_PORT||4389);
const launch=process.env.ASTRA_BROWSER_LAUNCHER?(await import(pathToFileURL(process.env.ASTRA_BROWSER_LAUNCHER))).launchWebGPU:()=>chromium.launch({headless:true,channel:process.env.ASTRA_CHROME_EXECUTABLE?undefined:'chrome',executablePath:process.env.ASTRA_CHROME_EXECUTABLE,args:['--enable-unsafe-webgpu']});
const server=spawn(process.execPath,['tools/serve.mjs','--dist'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
let browser;
const results={errors:[],relocations:{},views:[]};
try{
  browser=await launch();
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  page.setDefaultTimeout(60000);
  page.on('pageerror',e=>results.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')results.errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(()=>window.__ASTRA__?.ready||window.__ASTRA_BOOT_ERROR__,null,{timeout:90000});
  assert.equal(await page.evaluate(()=>window.__ASTRA__?.ready),true);
  await page.locator('[data-action="new-game"]').click();
  await page.evaluate(()=>window.__ASTRA__.onAction('settings',{quality:'low',renderScale:.5,adaptive:false,volume:0}));
  results.relocations.teleport=await page.evaluate(async()=>{
    const a=window.__ASTRA__,s=a.worldStream,before=s.getStats().generation;
    s._nextCheck=Infinity;
    a.teleport([70,0,45]);
    const immediate=s.getStats().generation>before;
    await s.whenSettled();return {immediate,settled:s.getStats().settled};
  });
  assert.equal(results.relocations.teleport.immediate,true);
  results.relocations.newGame=await page.evaluate(async()=>{
    const a=window.__ASTRA__,s=a.worldStream,before=s.getStats().generation;
    s._nextCheck=Infinity;
    await a.onAction('confirm-new');
    const immediate=s.getStats().generation>before;
    await s.whenSettled();return {immediate,position:[...a.player.position],settled:s.getStats().settled};
  });
  assert.equal(results.relocations.newGame.immediate,true);
  await page.evaluate(async()=>{
    const a=window.__ASTRA__;
    await a.onAction('settings',{quality:'low',renderScale:.5,adaptive:false,volume:0});
    a.teleport([70,0,45]);await a.worldStream.whenSettled();
    window.__ASTRA_RECOVERY_GENERATION__=a.worldStream.getStats().generation;
    a.worldStream._nextCheck=Infinity;a.game.data.player.health=0;
  });
  await page.waitForFunction(()=>{
    const a=window.__ASTRA__;
    return Math.hypot(...a.player.position.map((v,i)=>v-a.world.spawn.position[i]))<.1&&a.game.data.player.health>0;
  },null,{polling:100,timeout:30000});
  results.relocations.recovery=await page.evaluate(async()=>{
    const a=window.__ASTRA__,immediate=a.worldStream.getStats().generation>window.__ASTRA_RECOVERY_GENERATION__;
    await a.worldStream.whenSettled();return {immediate,settled:a.worldStream.getStats().settled};
  });
  assert.equal(results.relocations.recovery.immediate,true);
  await page.evaluate(()=>{const a=window.__ASTRA__;a.game.data.world.weather='clear';a.game.data.world.hour=15.5;return a.onAction('settings',{quality:'medium',renderScale:1,adaptive:false,volume:0,fov:75});});
  const views=[
    {id:'market-diagonal',position:[-20.8,0,-13],yaw:-2.331809,pitch:.115},
    {id:'market-reverse',position:[-9.8,0,7.7],yaw:.346647,pitch:.065},
    {id:'freight-street',position:[-53,0,-26],yaw:-1.610170,pitch:.055},
    {id:'silt-yard',position:[62.5,0,-27.8],yaw:0,pitch:.08},
    {id:'station-layers',position:[16.5,0,23.8],yaw:-3.087159,pitch:.2},
    {id:'western-roofs',position:[-28,0,24],yaw:1.735945,pitch:.16},
  ];
  for(const view of views){
    await page.evaluate(async v=>{const a=window.__ASTRA__;await a.renderAt(v.position,v.yaw,v.pitch);await a.renderer.device.queue.onSubmittedWorkDone();},view);
    await page.waitForFunction(()=>!window.__ASTRA__.renderer.getStats().visibilityPending,null,{polling:100,timeout:90000});
    await page.screenshot({path:path.join(output,view.id+'.png'),timeout:60000});
    const evidence=await page.evaluate(()=>{const a=window.__ASTRA__;return {position:[...a.player.position],stats:a.getStats(),stream:a.worldStream.getStats(),errors:a.renderer.errors};});
    assert.deepEqual(evidence.errors,[]);
    results.views.push({...view,...evidence});
    console.log(`Captured native WebGPU view: ${view.id}`);
  }
  assert.deepEqual(results.errors,[]);
  results.passed=true;
  await page.evaluate(()=>window.__ASTRA__.dispose());
}catch(error){process.exitCode=1;results.failure=error.stack;}
finally{
  await writeFile(path.join(output,'capture-result.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({passed:results.passed,views:results.views.length,relocations:results.relocations,failure:results.failure,errors:results.errors}));
  await browser?.close();server.kill();
}
