import {chromium} from 'playwright-core';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'test-results');
await mkdir(output,{recursive:true});
const port=Number(process.env.ASTRA_TEST_PORT || 4388);
const launchWebGPU=process.env.ASTRA_BROWSER_LAUNCHER?(await import(pathToFileURL(process.env.ASTRA_BROWSER_LAUNCHER))).launchWebGPU:()=>chromium.launch({headless:true,channel:process.env.ASTRA_CHROME_EXECUTABLE?undefined:'chrome',executablePath:process.env.ASTRA_CHROME_EXECUTABLE,args:['--enable-unsafe-webgpu']});
const server=spawn(process.execPath,['tools/serve.mjs','--dist'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
const browser=await launchWebGPU();
const page=await browser.newPage({viewport:{width:1280,height:720}});
page.setDefaultTimeout(25000);
const errors=[],results={};
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const quality=()=>page.evaluate(()=>window.__ASTRA__.onAction('settings',{quality:'low',renderScale:.5,adaptive:false,volume:0}));
try{
 await page.goto(`http://127.0.0.1:${port}`);
 await page.waitForFunction(()=>window.__ASTRA__?.ready || window.__ASTRA_BOOT_ERROR__,{timeout:90000});
 const boot=await page.evaluate(()=>({error:window.__ASTRA_BOOT_ERROR__,ready:window.__ASTRA__?.ready,mode:window.__ASTRA__?.getMode()}));
 results.boot=boot;if(boot.error)throw new Error(boot.error);
 await page.evaluate(async()=>{const a=window.__ASTRA__;await a.onAction('settings',{quality:'low',renderScale:.5,adaptive:false,volume:0});await a.renderer.device.queue.onSubmittedWorkDone();});
 await page.screenshot({path:output+'/release-menu.png',timeout:45000});
 await quality();
 await page.locator('[data-action="new-game"]').click();
 await quality();
 await page.waitForFunction(()=>window.__ASTRA__.getMode()==='playing');
 results.started=true;
 await page.evaluate(async()=>{
   const a=window.__ASTRA__;
   await a.onAction('settings',{quality:'low',renderScale:.5,adaptive:false,volume:0});
   await a.renderAt([-21.8,0,-22.35],Math.PI-.06,-.025);
   await a.renderer.device.queue.onSubmittedWorkDone();
 });
 results.densityView=await page.evaluate(()=>({density:window.__ASTRA__.world.densityReport,stats:window.__ASTRA__.getStats(),ambient:window.__ASTRA__.world.ambientAnchors?.length||0}));
 await page.screenshot({path:output+'/street-density.png',timeout:45000});
 await quality();
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>window.__ASTRA__.ui.isOpen);
 results.pause=await page.evaluate(()=>window.__ASTRA__.ui.panel);
 await page.evaluate(()=>window.__ASTRA__.onAction('open-panel',{panel:'map'}));
 results.map=await page.locator('#astra-panel-title').textContent();
 await page.screenshot({path:output+'/map.png',timeout:45000});
 await page.evaluate(()=>window.__ASTRA__.onAction('resume'));
 await page.evaluate(()=>{
   const a=window.__ASTRA__,t=a.world.interactables.find(t=>t.id==='mara');
   a.player.restore({position:[t.position[0],t.position[1],t.position[2]-1.4],yaw:Math.PI,pitch:0});
   a.interact();
 });
 results.dialogue=await page.locator('#astra-panel-title').textContent();
 await page.getByRole('button',{name:/Medicine Before Midnight/}).click();
 results.questAccepted=await page.evaluate(()=>window.__ASTRA__.game.data.quests.intro?.status);
 await page.evaluate(()=>window.__ASTRA__.onAction('resume'));
 for(const id of ['clinic_drop','mara']){
   await page.evaluate(id=>{const a=window.__ASTRA__,t=a.world.interactables.find(t=>t.id===id);a.player.restore({position:[...t.position],yaw:0,pitch:0});a.interact();},id);
   await page.evaluate(()=>window.__ASTRA__.onAction('resume'));
 }
 results.intro=await page.evaluate(()=>({entry:window.__ASTRA__.game.data.quests.intro,credits:window.__ASTRA__.game.data.player.credits}));
 await page.evaluate(()=>window.__ASTRA__.onAction('open-panel',{panel:'inventory'}));
 results.inventory=await page.locator('#astra-panel-title').textContent();
 await page.evaluate(()=>window.__ASTRA__.onAction('open-panel',{panel:'settings'}));
 const slider=page.locator('[data-setting="volume"]');
 results.settings=await slider.count();
 await page.evaluate(()=>window.__ASTRA__.onAction('resume'));
 await page.evaluate(()=>window.__ASTRA__.onAction('hack-start',{id:'relay'}));
 results.hack=await page.evaluate(()=>({panel:window.__ASTRA__.ui.panel,tiles:window.__ASTRA__.ui.hack?.tiles.length}));
 const solution=await page.evaluate(()=>{
   const h=window.__ASTRA__.ui.hack,n=h.n,flip=Math.floor(h.source/n)===n-1,path=[];
   for(let c=0;c<n;c++)for(let r=0;r<n;r++){const y=c%2===0?r:n-1-r;path.push([flip?n-1-y:y,c]);}
   const direction=([r,c],[r2,c2])=>r2<r?1:c2>c?2:r2>r?4:8;
   const moves=[];
   path.forEach((cell,i)=>{const idx=cell[0]*n+cell[1],mask=(i===0?8:direction(cell,path[i-1]))|(i===path.length-1?2:direction(cell,path[i+1]));let value=h.tiles[idx],turns=0;while(value!==mask&&turns<4){value=((value<<1)&15)|((value&8)>>3);turns++;}moves.push({idx,turns});});
   return moves;
 });
 for(const move of solution){for(let i=0;i<move.turns;i++){if(await page.locator(`[data-tile="${move.idx}"]`).count())await page.locator(`[data-tile="${move.idx}"]`).click();}}
 results.hackCompleted=await page.evaluate(()=>window.__ASTRA__.game.data.world.hacked.includes('relay'));
 await page.evaluate(()=>window.__ASTRA__.onAction('resume'));
 
 await page.evaluate(async()=>{
   const a=window.__ASTRA__;
   await a.onAction('accept-quest',{id:'static_below'});
   await a.onAction('buy',{id:'repair_rig'});
   await a.onAction('equip',{id:'repair_rig'});
   await a.onAction('repair-start',{id:'pump'});
 });
 results.assistedRepair=(await page.locator('body').innerText()).includes('1 / 2');
 const energyBefore=await page.evaluate(()=>window.__ASTRA__.game.data.player.energy);
 await page.getByRole('button',{name:/Bleed pressure/}).click();
 results.assistedMistake=await page.evaluate(before=>({cost:before-window.__ASTRA__.game.data.player.energy,panel:window.__ASTRA__.ui.panel}),energyBefore);
 await page.getByRole('button',{name:/Isolate intake/}).click();
 await page.getByRole('button',{name:/Bridge contact/}).click();
 await page.evaluate(()=>window.__ASTRA__.onAction('talk',{id:'ivo'}));
 results.rewardDoor=await page.evaluate(()=>({quest:window.__ASTRA__.game.data.quests.static_below.status,collisionOpen:window.__ASTRA__.collision.disabled.has('service_door'),visualRemoved:!window.__ASTRA__.renderer._worldInstances.some(i=>i.owner==='service_door')}));
 results.story=await page.evaluate(async()=>{
   const a=window.__ASTRA__,g=a.game;
   const check=r=>{if(!r.ok)throw new Error(r.message);return r;};
   check(g.acceptQuest('missing_shift'));
   for(const id of ['cache','rescue','sana','orin'])check(g.interact(id));
   check(g.acceptQuest('sealed_orders'));check(g.emit('hack',{target:'archive'}));check(g.discover('memorial'));check(g.interact('mara'));
   check(g.acceptQuest('district_choice'));check(g.emit('repair',{target:'grid_switch'}));check(g.interact('orin'));
   await a.onAction('world-choice',{target:'grid_switch',choice:'commons'});
   return {ending:g.data.world.ending,complete:g.data.world.flags.storyComplete,panel:a.ui.panel,power:g.data.world.power};
 });
 results.endingVisible=(await page.locator('body').innerText()).includes(results.story.ending.title);
 await page.getByRole('button',{name:/Continue in the ward/}).click();
 await page.evaluate(()=>window.__ASTRA__.onAction('replay-ending'));
 results.endingReplay=(await page.locator('body').innerText()).includes(results.story.ending.title);
 await page.evaluate(()=>window.__ASTRA__.onAction('resume'));

 results.saved=await page.evaluate(()=>window.__ASTRA__.save());
 const before=await page.evaluate(()=>({credits:window.__ASTRA__.game.data.player.credits,quests:window.__ASTRA__.game.data.quests,position:window.__ASTRA__.game.data.player.position}));
 await page.reload();
 await page.waitForFunction(()=>window.__ASTRA__?.ready || window.__ASTRA_BOOT_ERROR__,{timeout:90000});
 await quality();
 const after=await page.evaluate(()=>({credits:window.__ASTRA__.game.data.player.credits,quests:window.__ASTRA__.game.data.quests,position:window.__ASTRA__.game.data.player.position}));
 results.reload={matches:JSON.stringify(before)===JSON.stringify(after),before,after};
 results.renderer=await page.evaluate(()=>({errors:window.__ASTRA__.renderer.errors,stats:window.__ASTRA__.getStats(),errorsAll:window.__ASTRA__.errors}));
 await page.screenshot({path:output+'/game-menu.png',timeout:45000});
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>window.__ASTRA__.onAction('open-panel',{panel:'settings'}));
 results.mobile=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,menu:document.querySelector('#touch-menu')!==null}));
 await page.screenshot({path:output+'/mobile-settings.png',timeout:45000});
 
 await page.evaluate(async()=>{
   const a=window.__ASTRA__;a.game.data.world.weather='rain';a.game.data.world.hour=23;
   a.renderer.render(a.player.camera(75),{hour:23,weather:'rain',wetness:1,time:30},{quality:'low',renderScale:.5});
   await a.renderer.device.queue.onSubmittedWorkDone();
 });
 results.rain={rendered:true,errors:await page.evaluate(()=>window.__ASTRA__.renderer.errors)};
 results.webMcpAvailable=await page.evaluate(()=>typeof document.modelContext?.registerTool==='function');
 await page.evaluate(()=>window.__ASTRA__.dispose());
 results.disposed=await page.evaluate(()=>window.__ASTRA__.renderer.ready===false);
 await page.goto(pathToFileURL(path.join(root,'dist/astra-city.html')).href);
 await page.waitForFunction(()=>window.__ASTRA__?.ready || window.__ASTRA_BOOT_ERROR__,{timeout:90000});
 results.standalone=await page.evaluate(()=>({ready:window.__ASTRA__?.ready,error:window.__ASTRA_BOOT_ERROR__,workerEmbedded:typeof window.__ASTRA_WORKER_SOURCE__==='string',errors:window.__ASTRA__?.errors}));
 await quality();
 await page.evaluate(()=>window.__ASTRA__.dispose());
 const unsupported=await browser.newPage();
 await unsupported.addInitScript(()=>Object.defineProperty(navigator,'gpu',{configurable:true,value:undefined}));
 await unsupported.goto(`http://127.0.0.1:${port}`);
 await unsupported.waitForFunction(()=>window.__ASTRA_BOOT_ERROR__,{timeout:20000});
 results.unsupported=await unsupported.evaluate(()=>({message:window.__ASTRA_BOOT_ERROR__,visible:document.body.innerText.includes('WebGPU')}));
 await unsupported.close();
 results.errors=errors;
 assert.equal(results.intro.entry.status,'completed');
 assert.equal(results.hackCompleted,true);
 assert.equal(results.reload.matches,true);
 assert.equal(results.assistedRepair,true);
 assert.equal(results.assistedMistake.cost,1);
 assert.equal(results.rewardDoor.collisionOpen,true);
 assert.equal(results.rewardDoor.visualRemoved,true);
 assert.equal(results.endingVisible,true);
 assert.equal(results.endingReplay,true);
 assert.equal(results.story.complete,true);
 assert.equal(results.mobile.scroll,results.mobile.viewport);
 assert.equal(results.standalone.ready,true);
 assert.equal(results.standalone.workerEmbedded,true);
 assert.equal(results.unsupported.visible,true);
 assert.equal(results.disposed,true);
 assert.deepEqual(results.rain.errors,[]);
 assert.deepEqual(errors,[]);

}catch(error){process.exitCode=1;results.failure=error.stack;results.errors=errors;try{results.body=(await page.locator('body').innerText()).slice(0,7000);await page.screenshot({path:output+'/ui-failure.png',timeout:30000});}catch{}}
finally{
 await writeFile(output+'/browser-result.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results));await browser.close();server.kill();
}
