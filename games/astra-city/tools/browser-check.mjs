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
page.setDefaultTimeout(45000);
const errors=[],results={};
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const quality=()=>page.evaluate(()=>window.__ASTRA__.onAction('settings',{quality:'low',renderScale:.5,adaptive:false,volume:0}));
try{
 await page.goto(`http://127.0.0.1:${port}`);
 await page.waitForFunction(()=>window.__ASTRA__?.ready || window.__ASTRA_BOOT_ERROR__,null,{timeout:90000});
 const boot=await page.evaluate(()=>({error:window.__ASTRA_BOOT_ERROR__,ready:window.__ASTRA__?.ready,mode:window.__ASTRA__?.getMode()}));
 results.boot=boot;if(boot.error)throw new Error(boot.error);
 await page.evaluate(async()=>{const a=window.__ASTRA__;await a.onAction('settings',{quality:'medium',renderScale:1,adaptive:false,volume:0});await a.renderer.device.queue.onSubmittedWorkDone();});
 await page.screenshot({path:output+'/release-menu.png',timeout:45000});
 await quality();
 await page.locator('[data-action="new-game"]').click();
 await quality();
 await page.waitForFunction(()=>window.__ASTRA__.getMode()==='playing');
 results.started=true;
 const walkStart=await page.evaluate(()=>[...window.__ASTRA__.player.position]);
 await page.keyboard.down('w');
 try{await page.waitForFunction(start=>Math.hypot(...window.__ASTRA__.player.position.map((v,i)=>v-start[i]))>.05,walkStart,{polling:100,timeout:20000});}finally{await page.keyboard.up('w');}
 results.walk=await page.evaluate(start=>({distance:Math.hypot(...window.__ASTRA__.player.position.map((v,i)=>v-start[i]))}),walkStart);
 assert.ok(results.walk.distance>.05,'Movement input must change the player position.');
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>window.__ASTRA__.ui.isOpen);
 results.pause=await page.evaluate(()=>window.__ASTRA__.ui.panel);
 await page.evaluate(()=>window.__ASTRA__.onAction('open-panel',{panel:'map'}));
 results.map=await page.locator('#astra-panel-title').textContent();
 await page.screenshot({path:output+'/map.png',timeout:45000});
 await page.evaluate(()=>window.__ASTRA__.onAction('resume'));
 // Exercise every authored mechanical interaction through the same E key as play.
 await page.setViewportSize({width:640,height:360});
 results.travel=[];
 for(const id of ['rooftop_ladder','rooftop_ladder_down','service_ladder','service_ladder_top','lift_ground','lift_roof','needle_house_lift','needle_house_lift_roof']){
   const target=await page.evaluate(async id=>{
     const a=window.__ASTRA__,t=a.world.interactables.find(t=>t.id===id);
     await a.renderAt(t.position,0,0);
     return {id:t.id,type:t.type,to:t.target};
   },id);
   await page.keyboard.press('e');
   const began=await page.evaluate(()=>({mode:window.__ASTRA__.player.travel?.mode,overlay:getComputedStyle(document.getElementById('travel-transition')).display!=='none'}));
   if(target.type==='ladder')assert.equal(began.mode,'ladder',`${id}: E must start a waypoint climb`);
   else{
     assert.equal(began.overlay,true,`${id}: the lift ride must be opaque`);
     // Repeated interaction cannot restart or interrupt an enclosed ride.
     await page.keyboard.press('e');
   }
   await page.waitForFunction(to=>{
     const a=window.__ASTRA__;
     return !a.player.travel&&Math.hypot(...a.player.position.map((v,i)=>v-to[i]))<.06&&getComputedStyle(document.getElementById('travel-transition')).display==='none';
   },target.to,{polling:100,timeout:90000});
   const arrival=await page.evaluate(()=>{
     const a=window.__ASTRA__,p=a.player.position;
     return {position:[...p],clear:!a.collision.blocked(p,.32,1.76),supported:Math.abs(a.collision.floorAt(p,.32,.05,.15)-p[1])<.05,settled:a.worldStream.getStats().settled};
   });
   assert.equal(arrival.clear,true,`${id}: arrival is obstructed`);
   assert.equal(arrival.supported,true,`${id}: arrival has no floor`);
   assert.equal(arrival.settled,true,`${id}: destination detail is not resident`);
   results.travel.push({...target,began,arrival});
   console.log(`Mechanical travel passed: ${id}`);
 }
 // Hold a real cell response until transit has arrived to exercise the reveal race.
 await page.evaluate(async()=>{
   const a=window.__ASTRA__,s=a.worldStream,t=a.world.interactables.find(t=>t.id==='transit_works');
   await a.renderAt(t.position,0,0);
   const probe=window.__ASTRA_TRANSIT_PROBE__={receive:s._receive,onChange:s.onChange,before:a.renderer.getStats().submittedFrames};
   s._receive=function(response){if(response.type==='cells'&&!probe.held){probe.held=response;return;}return probe.receive.call(this,response);};
   s.onChange=function(...args){probe.onChange(...args);probe.requiredFrame=a.renderer.getStats().submittedFrames+1;};
 });
 await page.keyboard.press('e');
 await page.getByRole('button',{name:/Northline Roof Station/}).click();
 await page.waitForFunction(()=>{
   const a=window.__ASTRA__,p=window.__ASTRA_TRANSIT_PROBE__;
   return p.held&&Math.hypot(a.player.position[0]-13,a.player.position[1]-8.4,a.player.position[2]-57)<.06&&a.renderer.getStats().completedFrames>p.before+1;
 },null,{polling:100,timeout:20000});
 results.delayedTransit=await page.evaluate(()=>({hidden:getComputedStyle(document.getElementById('travel-transition')).display!=='none',settled:window.__ASTRA__.worldStream.getStats().settled}));
 assert.equal(results.delayedTransit.hidden,true);
 assert.equal(results.delayedTransit.settled,false);
 await page.evaluate(()=>{const s=window.__ASTRA__.worldStream,p=window.__ASTRA_TRANSIT_PROBE__;s._receive=p.receive;p.receive.call(s,p.held);});
 await page.waitForFunction(()=>getComputedStyle(document.getElementById('travel-transition')).display==='none',null,{polling:100,timeout:90000});
 Object.assign(results.delayedTransit,await page.evaluate(()=>{
   const a=window.__ASTRA__,p=window.__ASTRA_TRANSIT_PROBE__,r={revealed:true,settledAfter:a.worldStream.getStats().settled,completedFrames:a.renderer.getStats().completedFrames,requiredFrame:p.requiredFrame};
   a.worldStream.onChange=p.onChange;delete window.__ASTRA_TRANSIT_PROBE__;return r;
 }));
 assert.equal(results.delayedTransit.settledAfter,true);
 assert.ok(results.delayedTransit.completedFrames>=results.delayedTransit.requiredFrame,'Transit revealed before the destination frame completed');
 await page.setViewportSize({width:1280,height:720});
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
 await page.waitForFunction(()=>window.__ASTRA__?.ready || window.__ASTRA_BOOT_ERROR__,null,{timeout:90000});
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
 results.streaming=await page.evaluate(async()=>{
   const a=window.__ASTRA__;
   const before=a.worldStream.getStats();
   await a.renderAt([70,0,45],0,0);
   await a.worldStream.whenSettled();
   const distant=a.worldStream.getStats();
   await a.renderAt(a.world.spawn.position,a.world.spawn.yaw,0);
   await a.worldStream.whenSettled();
   return {before,distant,returned:a.worldStream.getStats(),renderer:a.renderer.getStats()};
 });
 assert.equal(results.streaming.returned.loadedCells,9);
 assert.equal(results.streaming.returned.worldCells,16);
 assert.ok(results.streaming.returned.evictedCells>0);
 assert.ok(results.streaming.returned.residentInstances<results.streaming.returned.worldInstances);
 assert.equal(results.streaming.renderer.loadedCells,9);
 assert.ok(results.streaming.renderer.inFlightFrames<=2);
 await page.evaluate(()=>{const a=window.__ASTRA__;a.player.yaw=Math.PI/2;a.ui._lastUpdate=-Infinity;a.ui.update({heading:Math.PI/2});});
 results.compass=await page.locator('.compass-current').textContent();
 assert.equal(results.compass,'W');
 await page.keyboard.press('F4');
 await page.locator('#developer-controls [name="people"]').check();
 results.debug={populationControl:await page.locator('#developer-controls [name="people"]').isChecked(),lightingModes:[]};
 for(const value of ['1','2','3','0']){
   await page.locator('#developer-controls [name="lighting"]').selectOption(value);
   await page.evaluate(async()=>{const a=window.__ASTRA__;await a.renderer.device.queue.onSubmittedWorkDone();});
   results.debug.lightingModes.push(value);
 }
 await page.keyboard.press('F4');
 results.webMcpAvailable=await page.evaluate(()=>typeof document.modelContext?.registerTool==='function');
 await page.evaluate(()=>window.__ASTRA__.dispose());
 results.disposed=await page.evaluate(()=>window.__ASTRA__.renderer.ready===false);
 await page.goto(pathToFileURL(path.join(root,'dist/astra-city.html')).href);
 await page.waitForFunction(()=>window.__ASTRA__?.ready || window.__ASTRA_BOOT_ERROR__,null,{timeout:90000});
 results.standalone=await page.evaluate(()=>({ready:window.__ASTRA__?.ready,error:window.__ASTRA_BOOT_ERROR__,workerEmbedded:typeof window.__ASTRA_WORKER_SOURCE__==='string',errors:window.__ASTRA__?.errors}));
 await quality();
 await page.evaluate(()=>window.__ASTRA__.dispose());
 await page.goto(`http://127.0.0.1:${port}`);
 await page.waitForFunction(()=>window.__ASTRA__?.ready || window.__ASTRA_BOOT_ERROR__,null,{timeout:90000});
 await quality();
 await page.evaluate(()=>window.__ASTRA__.renderer.device.destroy());
 await page.waitForFunction(()=>window.__ASTRA_BOOT_ERROR__,null,{timeout:20000});
 const stoppedAt=await page.evaluate(()=>window.__ASTRA__.metrics.frames);
 await page.waitForTimeout(180);
 results.deviceLoss={stopped:await page.evaluate(n=>window.__ASTRA__.metrics.frames===n,stoppedAt),retryButton:await page.getByRole('button',{name:'Retry graphics'}).count()};
 assert.equal(results.deviceLoss.stopped,true);
 assert.equal(results.deviceLoss.retryButton,1);
 await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.getByRole('button',{name:'Retry graphics'}).click()]);
 await page.waitForFunction(()=>window.__ASTRA__?.ready || window.__ASTRA_BOOT_ERROR__,null,{timeout:90000});
 results.retry=await page.evaluate(()=>({ready:window.__ASTRA__?.ready,error:window.__ASTRA_BOOT_ERROR__,hasSave:window.__ASTRA__?.game.hasSave()}));
 assert.equal(results.retry.ready,true);
 assert.equal(results.retry.hasSave,true);
 await page.evaluate(()=>window.__ASTRA__.dispose());
 const unsupported=await browser.newPage();
 await unsupported.addInitScript(()=>Object.defineProperty(navigator,'gpu',{configurable:true,value:undefined}));
 await unsupported.goto(`http://127.0.0.1:${port}`);
 await unsupported.waitForFunction(()=>window.__ASTRA_BOOT_ERROR__,null,{timeout:20000});
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

}catch(error){process.exitCode=1;results.failure=error.stack;results.errors=errors;try{results.runtime=await page.evaluate(()=>{const a=window.__ASTRA__;return a?{mode:a.getMode(),stats:a.getStats(),position:a.player.position,frames:a.metrics.frames,errors:a.errors,rendererErrors:a.renderer.errors}:null;});results.body=(await page.locator('body').innerText()).slice(0,7000);await page.screenshot({path:output+'/ui-failure.png',timeout:30000});}catch{}}
finally{
 await writeFile(output+'/browser-result.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results));await browser.close();server.kill();
}
