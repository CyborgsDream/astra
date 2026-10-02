import {Renderer} from './engine/renderer.js';
import {CollisionWorld,PlayerController} from './engine/physics.js';
import {PlayerInput} from './engine/input.js';
import {Navigation,projectPoint} from './engine/navigation.js';
import {CityAudio} from './engine/audio.js';
import {Population} from './world/population.js';
import {SecuritySystem} from './world/security.js';
import {createWorldStream} from './world/cell-stream.js';
import {GameState} from './game/state.js';
import {QUESTS,ITEMS,FACTIONS} from './game/content.js';
import {GameUI} from './ui/ui.js';
import {registerWardTools} from './game/agent-tools.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const canvas=document.getElementById('game-canvas');
const ui=new GameUI(document.getElementById('ui-root'),onAction);
const game=new GameState({seed:73191,autoSave:false});
const renderer=new Renderer(canvas);
const audio=new CityAudio();
const errors=[];
const metrics={generationMs:0,initMs:0,frames:0,frameMs:16.7,cpuMs:0,maxFrameMs:0,autoSaves:0};
let world,collision,player,population,navigation,security,input;
let worldStream=null;
let mode='loading',hasSave=false,started=false,nearby=null,objective=null,waypoint=null;
let renderTime=0,lastFrame=performance.now(),uiClock=0,saveClock=0,discoveryClock=0,routeClock=0;
let route=[],scannerTime=0,debugEnabled=false,performanceEnabled=false,worldClockFrozen=false,detailLevel=2;
let adaptiveScale=1,slowFrames=0,fastFrames=0,saveErrorShown=false,frameRequest=0;
let repairSession=null,dialogueTarget=null,transition=null,disposal=false;
let openedSignature='',disposeAgentTools=()=>{};
let camera,menuCamera,environment={time:0,hour:15.5,weather:'clear',wetness:0};
const userVehicle=[];
const overlay=document.createElement('canvas');
overlay.id='navigation-overlay';overlay.setAttribute('aria-hidden','true');
Object.assign(overlay.style,{position:'fixed',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'2'});
document.body.insertBefore(overlay,document.getElementById('ui-root'));
const overlayContext=overlay.getContext('2d');
const transitionScreen=document.createElement('div');transitionScreen.id='travel-transition';
Object.assign(transitionScreen.style,{position:'fixed',inset:'0',display:'none',alignItems:'center',justifyContent:'center',background:'#101a17',color:'#d5e7de',font:'500 20px system-ui',letterSpacing:'.06em',zIndex:100});
document.body.appendChild(transitionScreen);

window.addEventListener('error',e=>{errors.push(e.message);if(errors.length>30)errors.shift();});
window.addEventListener('unhandledrejection',e=>{errors.push(String(e.reason?.message||e.reason));if(errors.length>30)errors.shift();});
window.addEventListener('astra-gpu-error',e=>fatal(`Graphics device interrupted. ${e.detail || ''}`));

async function generateWorld(seed) {
  const stream=await createWorldStream(seed);
  if(disposal || mode==='error'){stream.dispose();throw new Error('City startup was interrupted.');}
  worldStream=stream;metrics.generationMs=stream.generationMs;
  return stream.world;
}

async function init() {
  const start=performance.now();
  try {
    ui.loading('Preparing Switchback Ward',.08);
    hasSave=game.hasSave();
    if(hasSave && !game.load())hasSave=false;
    const worldTask=generateWorld(game.data.seed ?? 73191);
    const [,generatedWorld]=await Promise.all([renderer.init(),worldTask]);
    ui.loading('Connecting streets, rooftops and the undercroft',.32);
    world=generatedWorld;
    collision=new CollisionWorld(world.colliders,world.ramps);
    navigation=new Navigation(world);
    player=new PlayerController(collision,world.spawn);
    if(hasSave)player.restore(game.data.player);
    else game.setPlayer(player.position,player.yaw,player.pitch);
    collision.setOpen(game.data.world.opened);
    openedSignature=[...(game.data.world.opened || [])].sort().join('|');
    population=new Population(world,world.seed,collision);
    security=new SecuritySystem(world,collision);
    environment.hour=Number.isFinite(game.data.world.hour)?game.data.world.hour:15.5;
    environment.weather=game.data.world.weather || 'clear';
    ui.loading('Loading the market, nearby streets and rooftop detail',.62);
    worldStream.update(world.spawn.position,{force:true});
    await worldStream.whenSettled();
    worldStream.onChange=()=>{
      if(disposal || !renderer.ready || mode==='error')return;
      uploadVisibleWorld();
      // Keep an enclosed ride hidden until a frame using its destination detail completes.
      if(transition?.arrived)transition.requiredFrame=renderer.getStats().submittedFrames+1;
    };
    worldStream.onError=error=>fatal(`District streaming failed. ${error.message}`);
    await uploadVisibleWorld();
    population.update(.02,player,environment);
    renderer.setDynamic(population.instances());
    input=new PlayerInput(canvas,{press:onKey,look:(x,y)=>player.look(x,y,game.data.settings.sensitivity,game.data.settings.invertY),unlock:()=>{if(mode==='playing' && !ui.isOpen && !transition && !debugEnabled)openPanel('pause');},blur:()=>{if(mode==='playing' && !ui.isOpen && !transition && !debugEnabled)openPanel('pause');},lockUnavailable:()=>ui.toast('Drag on the city to look around.','info')});
    input.enabled=false;
    ui.setWorld?.(world);
    menuCamera={position:[world.spawn.position[0],world.spawn.position[1]+1.75,world.spawn.position[2]],yaw:world.spawn.yaw||0,pitch:world.spawn.pitch||.06,fov:75,near:.06,far:950};
    camera=menuCamera;
    audio.setVolume(game.data.settings.volume ?? .35);
    metrics.initMs=performance.now()-start;
    mode='menu';
    ui.showMenu(hasSave);
    adaptiveScale=game.data.settings.renderScale || 1;
    refreshUi();
    lastFrame=performance.now();
    frameRequest=requestAnimationFrame(frame);
    exposeDevelopmentApi();
    disposeAgentTools=registerWardTools({document,game,world,getPlayer:()=>player,getMode:()=>mode,setWaypoint:position=>onAction('waypoint',{position})});
  } catch(error) {fatal(error.message || String(error));}
}

function fatal(message) {
  if(!errors.includes(message))errors.push(message);
  mode='error';cancelAnimationFrame(frameRequest);input?.release();worldStream?.dispose();
  if(started && player)saveGame(false);
  if(window.__ASTRA__)window.__ASTRA__.ready=false;
  ui.showError(message);
  window.__ASTRA_BOOT_ERROR__=message;
}

function startGame(fresh=false,confirmed=false) {
  if(!world||!renderer.ready)return;
  if(fresh && hasSave && !confirmed){
    ui.dialogue({name:'Start a new journey?',role:'Saved progress',text:'Your current journey will be replaced. A recovery copy of the previous save is retained on this device.',choices:[{id:'confirm-new',label:'Start new game',action:'confirm-new'},{id:'keep',label:'Keep current journey',action:'main-menu'}]});return;
  }
  if(fresh){
    const reset=game.reset(world.seed);
    if(!reset.ok){handleResult(reset);return;}
    player.restore({...world.spawn});
    player.position=[...world.spawn.position];player.checkpoint=[...world.spawn.position];
    player.freeCamera=false;debugEnabled=false;document.getElementById('developer-controls')?.remove();
    transition=null;transitionScreen.style.display='none';repairSession=null;dialogueTarget=null;
    scannerTime=0;saveClock=0;routeClock=0;discoveryClock=0;renderTime=0;
    security.exposure=0;security.damageClock=0;for(const sensor of security.sensors)sensor.alert=0;
    game.setPlayer(player.position,player.yaw,player.pitch);
    collision.setOpen([]);
    openedSignature='';
    worldStream.update(player.position,{force:true});
    uploadVisibleWorld();
    waypoint=null;route=[];
  } else if(!started && hasSave) player.restore(game.data.player);
  started=true;mode='playing';ui.closePanel();ui.setPlaying(true);input.enabled=true;
  canvas.focus({preventScroll:true});input.requestLock();audio.start().catch(()=>{});
  if(fresh || !hasSave){ui.toast('Find Mara under the market awning. Press E to speak.','info');saveGame(false);}
  refreshUi();
}

function pauseInput() {if(input){input.enabled=false;input.release();}}
function resume() {
  if(!started){ui.showMenu(hasSave);mode='menu';return;}
  ui.closePanel();dialogueTarget=null;repairSession=null;mode='playing';
  input.enabled=true;canvas.focus({preventScroll:true});input.requestLock();refreshUi();
}

function panelData() {
  const views=new Map(game.getQuestView().map(q=>[q.id,q]));
  return {state:game.data,quests:Object.values(QUESTS).map(q=>({...q,...views.get(q.id)})),items:ITEMS,factions:FACTIONS,world,player:{position:player.position,yaw:player.yaw},waypoint,objective};
}
function openPanel(name,extra={}) {
  if(!world)return;
  ui.openPanel(name,{...panelData(),...extra});pauseInput();refreshUi();
}
function showDialogue(data) {ui.dialogue(data);pauseInput();}

function onKey(code,event={}) {
  if(mode==='loading'||mode==='error')return;
  if(code==='F3'){event.preventDefault?.();performanceEnabled=!performanceEnabled;return;}
  if(transition){event.preventDefault?.();return;}
  if(code==='F4'){event.preventDefault?.();toggleDebug();return;}
  if(code==='Escape'){
    event.preventDefault?.();
    if(debugEnabled){toggleDebug(false);return;}
    if(ui.isOpen){resume();return;}
    if(mode==='playing')openPanel('pause');
    return;
  }
  if(code==='F8'){event.preventDefault?.();saveGame(true);return;}
  if(ui.isOpen || mode!=='playing')return;
  if(code==='Space')player.jump();
  else if(code==='KeyE')interact();
  else if(code==='KeyM')openPanel('map');
  else if(code==='KeyJ')openPanel('journal');
  else if(code==='KeyI'||code==='Tab')openPanel('inventory');
  else if(code==='KeyQ')scan();
  else if(code==='Digit1')handleResult(game.use('medkit'));
  else if(code==='Digit2')handleResult(game.use('battery'));
  else if(code==='KeyR' && player.riding)toggleVehicle();
}

async function onAction(action,payload={}) {
  try {
    if(action==='retry-startup'){location.reload();return;}
    if(action==='new-game')startGame(true);
    else if(action==='confirm-new')startGame(true,true);
    else if(action==='continue')startGame(false);
    else if(action==='resume'||action==='close-panel')resume();
    else if(action==='main-menu'){
      if(started)saveGame(false);
      mode='menu';pauseInput();ui.setPlaying(false);ui.showMenu(hasSave);
    }
    else if(action==='open-panel')openPanel(payload.panel);
    else if(action==='save')saveGame(true);
    else if(action==='accept-quest'){
      handleResult(game.acceptQuest(payload.id));saveGame(false);
      if(dialogueTarget)talk(dialogueTarget,false);else openPanel('journal');
    }
    else if(action==='buy'){
      const result=game.buy(payload.id);handleResult(result);if(result.ok)audio.play('buy');
      if(dialogueTarget)showShop(dialogueTarget);else openPanel('inventory');
    }
    else if(action==='use'||action==='equip'){
      handleResult(game[action](payload.id));openPanel('inventory');
    }
    else if(action==='shop')showShop(world.interactables.find(i=>i.id===payload.id) || dialogueTarget);
    else if(action==='settings'){
      const s=game.data.settings;
      if(payload.quality && ['low','medium','high'].includes(payload.quality))s.quality=payload.quality;
      for(const [key,min,max] of [['renderScale',.5,1],['fov',55,100],['sensitivity',.15,3],['volume',0,1]])if(Number.isFinite(Number(payload[key])))s[key]=clamp(Number(payload[key]),min,max);
      for(const key of ['invertY','showMinimap','adaptive'])if(typeof payload[key]==='boolean')s[key]=payload[key];
      adaptiveScale=s.renderScale;audio.setVolume(s.volume);renderer.resize(adaptiveScale);game.save();
    }
    else if(action==='waypoint'){
      if(payload.position===null){waypoint=null;route=[];}
      else if(payload.position?.every(Number.isFinite)){
        waypoint=[...payload.position];route=navigation.route(player.position,waypoint);
        ui.toast('Waypoint set. The marker stays visible in the city.');
      }
    }
    else if(action==='interact')interact();
    else if(action==='talk')talk(world.interactables.find(i=>i.id===payload.id));
    else if(action==='travel')takeTransit(payload);
    else if(action==='hack-start')beginHack(world.interactables.find(i=>i.id===payload.id));
    else if(action==='hack-complete'){
      handleResult(game.emit('hack',{target:payload.target}));
      if(payload.target==='archive')game.emit('flag',{name:'securityDisabled',value:true});
      audio.play('hack');saveGame(false);resume();
    }
    else if(action==='repair-start')beginRepair(payload.id);
    else if(action==='repair-step')repairStep(payload.step);
    else if(action==='world-choice'){
      const result=handleResult(game.interact(payload.target,{choice:payload.choice}));saveGame(false);
      if(result?.ending)showEnding(result.ending);else resume();
    }
    else if(action==='replay-ending'){
      const result=game.replayEnding();if(result.ending)showEnding(result.ending);else handleResult(result);
    }
    else if(action==='toggle-power'){
      handleResult(game.emit('power',{enabled:!game.data.world.power}));saveGame(false);resume();
    }
    else if(action==='rest'){
      handleResult(game.emit('restore',{}));player.checkpoint=[...player.position];saveGame(true);resume();
    }
    else if(action==='ride'){toggleVehicle();resume();}
    else if(action==='scan'){scan();resume();}
    else if(action==='dialogue-choice'){
      if(payload.choice)onAction('world-choice',payload);else resume();
    }
  }catch(error){ui.toast(error.message || 'That action could not be completed.','error');errors.push(error.message);}
}

function handleResult(result,quiet=false) {
  if(!result)return;
  if(result.message && !quiet && !result.ending)ui.toast(result.message,result.ok?'info':'error');
  if(result.completed || result.questCompleted || result.reward)audio.play('complete');
  syncOpenedDoors();
  refreshUi();
  return result;
}

function syncOpenedDoors() {
  if(!world || !collision)return;
  const next=[...(game.data.world.opened || [])].sort().join('|');
  if(next===openedSignature)return;
  openedSignature=next;collision.setOpen(game.data.world.opened);
  uploadVisibleWorld();
}

function showEnding(ending) {
  showDialogue({name:ending.title,role:'Switchback Ward · story complete',text:`${ending.text}\n\nYour agreement is saved. The ward remains open: finish local work, revisit its people, and explore the upper and lower streets.`,choices:[{id:'continue-ward',label:'Continue in the ward',action:'resume'},{id:'ending-journal',label:'Open the journal',action:'open-panel',payload:{panel:'journal'}}]});
}

function saveGame(notify=true) {
  if(!player || !started)return false;
  game.setPlayer(player.position,player.yaw,player.pitch);
  const ok=game.save();
  if(ok){hasSave=true;metrics.autoSaves++;saveErrorShown=false;if(notify)ui.toast('Journey saved on this device.');}
  else if(notify || !saveErrorShown){ui.toast('The browser could not save this journey. Check available device storage.','error');saveErrorShown=true;}
  return ok;
}

function closestInteraction() {
  if(!player)return null;
  const eye=player.camera().position,fx=-Math.sin(player.yaw),fz=-Math.cos(player.yaw);
  const candidates=[];
  for(const item of world.interactables){
    const pos=item.position,d=distance([player.position[0],player.position[1]+.8,player.position[2]],[pos[0],pos[1]+.8,pos[2]]);
    if(d>(item.radius || 3.8) || Math.abs(pos[1]-player.position[1])>3)continue;
    const dx=pos[0]-eye[0],dz=pos[2]-eye[2],alignment=(dx*fx+dz*fz)/Math.max(.1,Math.hypot(dx,dz));
    if(d>1.6 && alignment<.12)continue;
    if(item.type!=='door' && !collision.lineOfSight(eye,[pos[0],pos[1]+1,pos[2]]))continue;
    const bias=item.id==='mara'?.3:0;
    candidates.push({...item,distance:d,score:d-alignment*.9-bias});
  }
  candidates.sort((a,b)=>a.score-b.score);
  return candidates[0] || null;
}

function interact() {
  if(transition || player.travel)return;
  if(player.riding){toggleVehicle();return;}
  const target=closestInteraction();
  if(!target){ui.toast('Move closer and face a person, door or terminal.');return;}
  audio.play('interact',target.position);
  if(target.type==='npc')return talk(target);
  const interactionResult=game.interact(target.id);
  if(interactionResult?.needsChoice && interactionResult.choices){
    showDialogue({name:target.name,role:'District grid control',text:interactionResult.message || 'Choose the ward’s power agreement.',choices:interactionResult.choices.map(c=>({id:c.id,label:c.label,description:c.description,action:'world-choice',payload:{target:target.id,choice:c.id}}))});return;
  }
  if(interactionResult?.changed)handleResult(interactionResult);
  const needsRepair=game.getObjectiveTargets().some(t=>t.target===target.id && t.kind==='repair');
  if(needsRepair)return beginRepair(target.id);
  if(target.id==='home'){
    showDialogue({name:target.name,role:'Your apartment',text:'A quiet place above the repair lane. Rest, recharge your kit and save the journey.',choices:[{id:'rest',label:'Rest and save',action:'rest'},...(game.data.world.ending?[{id:'ending',label:'Read the ward’s agreement',action:'replay-ending'}]:[]),{id:'leave',label:'Return to the district',action:'resume'}]});return;
  }
  if(target.type==='shop')return showShop(target);
  if(target.type==='terminal'){
    showDialogue({name:target.name,role:'Infrastructure terminal',text:target.description || 'A local service connection. Use your decoder to establish a clean circuit.',choices:[{id:'hack',label:'Open circuit interface',action:'hack-start',payload:{id:target.id}},{id:'repair',label:'Service the equipment',action:'repair-start',payload:{id:target.id}},{id:'back',label:'Leave terminal',action:'resume'}]});return;
  }
  if(target.type==='repair')return beginRepair(target.id);
  if(target.type==='vehicle'){dialogueTarget=target;showDialogue({name:target.name,role:'Neighbourhood transport',text:'Take a shared electric scooter. Use movement controls to ride, Shift for boost, and E to dismount.',choices:[{id:'ride',label:'Ride scooter',action:'ride'},{id:'leave',label:'Stay on foot',action:'resume'}]});return;}
  if(target.type==='transit'){
    const destinations=target.destinations || world.interactables.filter(i=>i.type==='transit'&&i.id!==target.id).map(i=>({name:i.name,position:i.position}));
    const text='Board the ward shuttle. Travel is free for registered district couriers.';
    showDialogue({name:target.name,role:'Ward transit',text,choices:[...destinations.map((d,i)=>({id:`stop-${i}`,label:d.name,description:`${Math.round(distance(target.position,d.position))} metres`,action:'travel',payload:{position:d.position,name:d.name}})),{id:'stay',label:'Stay here',action:'resume'}]});return;
  }
  if(target.type==='elevator')return takeLift(target);
  if(target.type==='ladder'){
    if(player.travel)return;
    const path=target.travelPath;
    const length=Array.isArray(path)?path.reduce((sum,p,i)=>sum+distance(i?path[i-1]:player.position,p),0):0;
    if(path&&player.moveAlongPath(path,Math.max(1,length/2.5),'ladder'))ui.toast('Climbing the service ladder.');
    else ui.toast('Stand on the clear landing in front of this ladder.','info');
    return;
  }
  if(target.type==='door'){
    const result=game.emit('open',{target:target.id});handleResult(result);
    saveGame(false);return;
  }
  if(target.type==='switch'){
    const result=interactionResult;
    if(result?.needsChoice && result.choices){
      showDialogue({name:target.name,role:'District grid control',text:result.message || 'Choose who should hold the district grid access key.',choices:result.choices.map(c=>({id:c.id,label:c.label,description:c.description,action:'world-choice',payload:{target:target.id,choice:c.id}}))});
    }else {
      handleResult(result);
      showDialogue({name:target.name,role:'Power distribution',text:game.data.world.power?'The local grid is connected.':'The local grid is isolated.',choices:[{id:'toggle',label:game.data.world.power?'Isolate local power':'Connect local power',action:'toggle-power'},...(game.data.world.ending?[{id:'review-agreement',label:'Review the ward’s agreement',action:'replay-ending'}]:[]),{id:'back',label:'Leave switch',action:'resume'}]});
    }
    return;
  }
  if(target.type==='vending'){dialogueTarget=target;showShop(target);return;}
  if(target.type==='discovery'){
    handleResult(game.discover(target.id));
    showDialogue({name:target.name,role:'Discovery',text:target.description || 'Another piece of the ward’s history.',choices:[{id:'leave',label:'Continue exploring',action:'resume'}]});saveGame(false);return;
  }
  if(target.type==='container'){
    handleResult(game.emit('loot',{target:target.id}));saveGame(false);return;
  }
  handleResult(interactionResult,interactionResult?.changed);saveGame(false);
}

function talk(target,advance=true) {
  if(!target)return;
  dialogueTarget=target;
  let result=advance?game.interact(target.id):null;
  if(result?.needsChoice && result.choices){
    showDialogue({name:target.name,role:target.role||'Resident',text:result.message,choices:result.choices.map(c=>({id:c.id,label:c.label,description:c.description,action:'world-choice',payload:{target:target.id,choice:c.id}}))});return;
  }
  if(result?.message && result.changed)handleResult(result);
  const available=game.getAvailableQuests(target.id) || [];
  const introductions={
    mara:'The ward runs on people who still turn up. Medicine to the clinic. Parts to a roof. Sometimes a question nobody else wants delivered. Looking for work?',
    ivo:'Machines do not fail all at once. Someone stops listening to them first. I keep tools and spare cells here, if you need something dependable.',
    sana:'We treat whoever comes through that door. Power has been unreliable, and the cold storage cannot wait for another committee meeting.',
    orin:'The crews built this district twice. Once when they put it up, and again every day they kept it running. Those missing workers are ours.',
    rescue:'I thought the service lift was coming back. Then the corridor went quiet. You are the first person I have seen since the shift changed.'
  };
  const active=game.getQuestView().filter(q=>q.status==='active' && (QUESTS[q.id]?.giver===target.id || q.objective?.target===target.id));
  let text=result?.changed && result.message?result.message:(target.description || introductions[target.id] || 'Every part of the ward has its own rhythm. Take the footbridges if the freight lane is crowded.');
  if(active.length)text+=`\n\n${active[0].text || active[0].objective?.text || ''}`;
  const choices=available.map(q=>({id:q.id,label:q.title,description:q.description,action:'accept-quest',payload:{id:q.id}}));
  if(['ivo','sana'].includes(target.id))choices.push({id:'shop',label:target.id==='sana'?'Browse medical supplies':'Browse tools and upgrades',action:'shop',payload:{id:target.id}});
  choices.push({id:'leave',label:'See you around',action:'resume'});
  showDialogue({name:target.name,role:target.role || 'Switchback Ward',text,choices});
  if(advance)saveGame(false);
}

function showShop(target) {
  if(!target)return;
  dialogueTarget=target;
  let stock=Object.values(ITEMS).filter(item=>Number.isFinite(item.price)&&item.price>0 && (!item.soldAt || item.soldAt.includes(target.id) || target.id==='workshop' && item.soldAt.includes('ivo')));
  if(target.id==='sana')stock=stock.filter(item=>['medkit','battery','snack','grid_coat'].includes(item.id));
  else if(target.id==='kiosk')stock=Object.values(ITEMS).filter(item=>['snack','battery'].includes(item.id));
  if(!stock.length)stock=Object.values(ITEMS).filter(item=>item.price>0 && !['quest','key','cargo'].includes(item.kind));
  showDialogue({name:target.name,role:`${game.data.player.credits} credits available`,text:'Choose supplies or equipment. Upgrades can be equipped in your inventory.',choices:[...stock.map(item=>({id:item.id,label:`${item.name} · ${item.price} credits`,description:item.description,action:'buy',payload:{id:item.id}})),{id:'leave',label:'Leave shop',action:'resume'}]});
}

function beginHack(target) {
  if(!target)return;
  if(!(game.data.player.inventory.hack_tool>0)){ui.toast('A circuit decoder is required.','error');return;}
  ui.openHack({targetId:target.id,name:target.name,difficulty:game.data.player.equipment.includes('signal_decoder')?1:target.id==='archive'?2:1});pauseInput();
}

function beginRepair(id) {
  const target=world.interactables.find(i=>i.id===id);
  if(!target)return;
  const assisted=(game.getEquipmentEffects?.().repairAssist || 0)>0;
  repairSession={id,stage:0,assisted,sequence:assisted?[0,2]:[0,1,2]};
  displayRepair();
}
function displayRepair() {
  const instructions=['Isolate the intake before opening the housing.','Bleed the trapped pressure from the bypass.','Bridge the damaged contact and run the calibration.'];
  const labels=['Isolate intake','Bleed pressure','Bridge contact'];
  const required=repairSession.sequence[repairSession.stage];
  const assistance=repairSession.assisted?' Your repair rig handles pressure relief automatically.':'';
  showDialogue({name:world.interactables.find(i=>i.id===repairSession.id)?.name || 'Field repair',role:`Service sequence · ${repairSession.stage+1} / ${repairSession.sequence.length}`,text:instructions[required]+assistance,choices:[...labels.map((label,step)=>({id:`repair-${step}`,label,action:'repair-step',payload:{step}})),{id:'cancel',label:'Leave equipment',action:'resume'}]});
}
function repairStep(step) {
  if(!repairSession)return;
  if(Number(step)!==repairSession.sequence[repairSession.stage]){game.data.player.energy=Math.max(0,game.data.player.energy-(repairSession.assisted?1:4));ui.toast('Pressure is still on the wrong side. Follow the service sequence.','error');return;}
  audio.play('interact');repairSession.stage++;
  if(repairSession.stage<repairSession.sequence.length)displayRepair();
  else{handleResult(game.emit('repair',{target:repairSession.id}));audio.play('complete');repairSession=null;saveGame(false);resume();}
}

function scan() {
  if(game.data.player.energy<4){ui.toast('Recharge your battery before scanning.','error');return;}
  game.data.player.energy-=4;scannerTime=7;audio.play('hack');
  const effects=game.getEquipmentEffects?.() || {},range=effects.scanRadius || 28;
  let found=0;
  for(const item of world.interactables){if(item.type==='discovery' && distance(player.position,item.position)<range){game.discover(item.id);found++;}}
  ui.toast(found?`${found} local discoveries resolved by the scanner.`:'Local infrastructure and interaction points highlighted.');
}

function toggleVehicle() {
  if(!player)return;
  player.riding=!player.riding;
  if(!player.riding){player.velocity[0]*=.2;player.velocity[2]*=.2;}
  ui.toast(player.riding?'Scooter active. E to dismount.':'Back on foot.');
  audio.play('interact');
}

function takeLift(target) {
  const to=target.target || target.destinations?.[0]?.position;
  if(!to?.every(Number.isFinite))return;
  const floor=collision.floorAt(to,.32,.05,.15);
  if(!Number.isFinite(floor)||Math.abs(floor-to[1])>.05||collision.blocked(to,.32,1.76)){ui.toast('The lift landing is obstructed.','info');return;}
  // Enclosed lift interiors are represented by an opaque ride transition.
  // The player changes landing behind it; no camera flies through architecture.
  transition={elapsed:0,duration:clamp(distance(player.position,to)/18,2,5),target:[...to],name:target.name,arrived:false,hourDelta:0};
  worldStream.update(transition.target,{force:true});
  ui.closePanel();pauseInput();
  transitionScreen.textContent=`SERVICE LIFT · ${to[1]>player.position[1]?'ASCENDING':'DESCENDING'}`;
  transitionScreen.style.display='flex';audio.play('interact');
}

function takeTransit(payload) {
  if(!payload.position?.every(Number.isFinite))return;
  const destination=world.interactables.find(i=>i.type==='transit' && distance(i.position,payload.position)<.1);
  const closeToStop=world.interactables.some(i=>i.type==='transit'&&distance(player.position,i.position)<8);
  if(!destination || !closeToStop){ui.toast('Board at a transit stop to use this route.','error');return;}
  transition={elapsed:0,duration:2,target:[...payload.position],name:payload.name || destination.name,arrived:false};
  worldStream.update(transition.target,{force:true});
  ui.closePanel();pauseInput();
  transitionScreen.textContent=`WARD TRANSIT · ${transition.name}`;
  transitionScreen.style.display='flex';audio.play('interact');
}

function uploadVisibleWorld() {
  renderer.setWorld(visibleWorldInstances(),world.signs);
  renderer.setResidentCells([...worldStream.resident.keys()]);
}

function visibleWorldInstances() {
  const opened=new Set(game.data.world.opened || []);
  return world.instances.filter(i=>(i.detail || 0)<=detailLevel && (!i.owner || !opened.has(i.owner)));
}

function updateObjective() {
  const targets=game.getObjectiveTargets() || [];
  const first=targets[0];
  const target=first && world.interactables.find(i=>i.id===first.target);
  if(target)objective={...first,position:target.position,distance:distance(player.position,target.position),label:first.label || target.name,name:target.name};
  else if(!game.getQuestView().some(q=>q.status==='active') && !game.data.quests.intro){
    const mara=world.interactables.find(i=>i.id==='mara');objective=mara?{target:'mara',position:mara.position,label:'Speak to Mara at the market',name:mara.name,distance:distance(player.position,mara.position)}:null;
  }else objective=null;
  if(waypoint && distance(player.position,waypoint)<3){waypoint=null;route=[];ui.toast('Waypoint reached.');}
}

function currentLocation() {
  let best=null,bestScore=Infinity;
  for(const location of world.locations){
    const d=distance(player.position,location.position);
    if(d<location.radius && Math.abs(player.position[1]-location.position[1])<5 && d<bestScore){best=location;bestScore=d;}
  }
  return best || {id:'ward',name:'Switchback Ward',level:player.position[1]<-3?-2:player.position[1]>7?2:0};
}

function discoverNearby() {
  for(const location of world.locations){
    if(distance(player.position,location.position)<location.radius && Math.abs(player.position[1]-location.position[1])<4 && !game.data.discoveries.includes(location.id)){
      const result=game.discover(location.id);if(result?.ok)ui.toast(`Discovered · ${location.name}`);
    }
  }
}

function refreshUi() {
  if(!player)return;
  game.setPlayer(player.position,player.yaw,player.pitch);
  updateObjective();
  ui.update({state:game.data,location:currentLocation(),environment,objective,nearby,heading:player.yaw,riding:player.riding,world,waypoint,stats:collectStats()});
}

function collectStats() {
  const r=renderer.getStats?.() || {},p=population?.getStats?.() || {},stream=worldStream?.getStats() || {};
  return {...r,...p,...stream,fps:r.frameMs>0?1000/r.frameMs:0,frameMs:r.frameMs || 0,simulationFrameMs:metrics.frameMs,cpuMs:metrics.cpuMs,loadedCells:stream.loadedCells ?? r.loadedCells ?? 0,worldObjects:world?.instanceCount ?? world?.instances.length ?? 0,renderScale:adaptiveScale,collisionQueries:collision?.queries || 0,securityExposure:security?.exposure || 0};
}

function updateVehicle() {
  userVehicle.length=0;
  if(!player.riding)return;
  const p=player.position,yaw=player.yaw;
  const add=(mesh,x,y,z,sx,sy,sz,color,material=1)=>{
    const c=Math.cos(yaw),s=Math.sin(yaw);
    userVehicle.push({mesh,position:[p[0]+x*c+z*s,p[1]+y,p[2]-x*s+z*c],scale:[sx,sy,sz],rotation:[0,yaw,0],color,material,detail:0});
  };
  add('box',0,.23,-.15,.46,.12,1.55,[.18,.36,.3]);
  add('cylinder',0,.78,-.65,.07,1.25,.07,[.27,.31,.29]);
  add('box',0,1.35,-.65,.72,.07,.08,[.12,.15,.14]);
  add('box',0,1.37,-.7,.2,.11,.09,[.26,.66,.52],6);
  for(const z of [-.66,.55])add('sphere',0,.18,z,.19,.36,.36,[.055,.062,.057]);
}

function powerIndicators() {
  const powered=game.data.world.power;
  return ['relay','pump','grid_switch','workshop','clinic_drop'].flatMap(id=>{
    const target=world.interactables.find(i=>i.id===id);if(!target)return [];
    const [x,y,z]=target.position;
    return [{mesh:'box',position:[x,y+2.2,z],scale:[.4,.13,.16],color:powered?[.3,.67,.47]:[.39,.17,.075],material:6,emissive:powered?.9:.06,detail:0}];
  });
}

function debugInstances() {
  if(!debugEnabled)return [];
  const out=[];
  const dev=document.getElementById('developer-controls');
  if(dev?.querySelector('[name="colliders"]')?.checked){
    const candidates=collision.query(player.position[0],player.position[2],13).filter(c=>distance([(c.min[0]+c.max[0])/2,player.position[1],(c.min[2]+c.max[2])/2],player.position)<24).slice(0,200);
    for(const c of candidates){
      const a=c.min,b=c.max;
      for(const y of [a[1],b[1]]){
        for(const z of [a[2],b[2]])out.push({mesh:'box',position:[(a[0]+b[0])/2,y,z],scale:[b[0]-a[0],.025,.025],color:[.9,.27,.1],material:6,emissive:.6});
        for(const x of [a[0],b[0]])out.push({mesh:'box',position:[x,y,(a[2]+b[2])/2],scale:[.025,.025,b[2]-a[2]],color:[.9,.27,.1],material:6,emissive:.6});
      }
      for(const x of [a[0],b[0]])for(const z of [a[2],b[2]])out.push({mesh:'box',position:[x,(a[1]+b[1])/2,z],scale:[.025,b[1]-a[1],.025],color:[.9,.27,.1],material:6,emissive:.6});
    }
  }
  if(dev?.querySelector('[name="cells"]')?.checked){
    for(const cell of world.cells){const b=cell.bounds;if(!b)continue;for(const x of [b[0],b[2]])out.push({mesh:'box',position:[x,.08,(b[1]+b[3])/2],scale:[.05,.05,b[3]-b[1]],color:[.18,.85,.52],material:6,emissive:1});for(const z of [b[1],b[3]])out.push({mesh:'box',position:[(b[0]+b[2])/2,.08,z],scale:[b[2]-b[0],.05,.05],color:[.18,.85,.52],material:6,emissive:1});}
  }
  if(dev?.querySelector('[name="people"]')?.checked){
    for(const actor of population.nearby(player.position,48).slice(0,80)){
      const [x,y,z]=actor.position,h=actor.type==='npc'?1.8:.9;
      const color=actor.authored?[.96,.74,.24]:actor.type==='npc'?[.23,.9,.56]:[.32,.64,1];
      for(const dx of [-.4,.4])for(const dz of [-.4,.4])out.push({mesh:'box',position:[x+dx,y+h/2,z+dz],scale:[.025,h,.025],color,material:6,emissive:1});
      out.push({mesh:'box',position:[x-Math.sin(actor.yaw)*.65,y+.06,z-Math.cos(actor.yaw)*.65],scale:[.05,.05,1.3],rotation:[0,actor.yaw,0],color,material:6,emissive:1});
    }
  }
  return out;
}

function frame(now) {
  if(disposal || mode==='error' || !renderer.ready)return;
  try {
  const cpuStart=performance.now(),raw=(now-lastFrame)/1000;
  const dt=clamp(raw,0,.05);lastFrame=now;renderTime+=dt;
  if(Number.isFinite(raw) && raw>0){metrics.frameMs=metrics.frameMs*.94+raw*1000*.06;metrics.maxFrameMs=Math.max(metrics.maxFrameMs,raw*1000);}
  metrics.frames++;
  const playing=mode==='playing' && !ui.isOpen && !debugEnabled && !transition;
  if(playing){
    const inputState=input.state();
    player.yaw+=inputState.turn*dt*1.7;
    if(worldClockFrozen){const hour=game.data.world.hour;game.tick(dt);game.data.world.hour=hour;}else game.tick(dt);
    player.update(dt,inputState,game.data);
    if(player.impact>11)handleResult(game.emit('damage',{amount:Math.round((player.impact-10)*2)}),true);
    scannerTime=Math.max(0,scannerTime-dt);
    const event=security.update(dt,player,game.data,renderTime);
    if(event.damage){handleResult(game.emit('damage',{amount:event.damage}),true);audio.play('damage');ui.toast(event.message,'error');}
    if(game.data.player.health<=0){
      player.position=[...player.checkpoint];player.velocity.fill(0);game.emit('restore',{});
      worldStream.update(player.position,{force:true});
      ui.toast('Recovered at your safe address. Your equipment and work are retained.','info');security.exposure=0;
    }
    discoveryClock+=dt;saveClock+=dt;routeClock+=dt;
    if(discoveryClock>1.3){discoveryClock=0;discoverNearby();}
    if(saveClock>30){saveClock=0;saveGame(false);}
    if(routeClock>2){routeClock=0;updateObjective();const goal=waypoint || objective?.position;route=goal?navigation.route(player.position,goal):[];}
  }else if(debugEnabled && player.freeCamera){
    input.enabled=document.activeElement===canvas || input.pointer;
    player.update(dt,input.state(),game.data);
  }
  if(transition){
    transition.elapsed+=dt;
    if(transition.elapsed>transition.duration*.5 && !transition.arrived){player.restore({position:transition.target,yaw:player.yaw,pitch:0});game.data.world.hour=(game.data.world.hour+(transition.hourDelta??.06))%24;transition.arrived=true;transition.requiredFrame=renderer.getStats().submittedFrames+1;}
    if(transition.elapsed>=transition.duration && worldStream.getStats().settled && renderer.getStats().completedFrames>=transition.requiredFrame){transition=null;transitionScreen.style.display='none';saveGame(false);resume();}
  }
  environment.time=renderTime;
  environment.hour=game.data.world.hour;
  environment.weather=game.data.world.weather;
  environment.power=game.data.world.power;
  environment.wetness+=((environment.weather==='rain'?1:0)-environment.wetness)*dt*.1;
  const sunAngle=(environment.hour-6)/12*Math.PI;
  environment.sunDirection=[Math.cos(sunAngle)*.72,Math.sin(sunAngle),-.45];
  if(mode==='menu')camera={...menuCamera,yaw:menuCamera.yaw+Math.sin(renderTime*.045)*.045};
  else camera=player.camera(game.data.settings.fov || 75);
  worldStream.update(transition?.target || camera.position);
  if((playing || mode==='menu') && population)population.update(dt,player,environment);
  if(!playing)security.update(0,player,game.data,renderTime);
  updateVehicle();
  const s=game.data.settings;
  if(s.adaptive!==false && playing){
    const renderMs=renderer.getStats().frameMs || metrics.frameMs;
    if(renderMs>29){slowFrames++;fastFrames=0;}else if(renderMs<17.8){fastFrames++;slowFrames=0;}
    if(slowFrames>90){adaptiveScale=Math.max(.5,adaptiveScale-.08);slowFrames=0;}
    if(fastFrames>600){adaptiveScale=Math.min(s.renderScale || 1,adaptiveScale+.04);fastFrames=0;}
  }
  if(renderer.canRender()){
    renderer.setDynamic([...population.instances(),...security.instances(),...powerIndicators(),...userVehicle,...debugInstances()]);
    renderer.render(camera,environment,{quality:s.quality || 'medium',renderScale:adaptiveScale,wireframe:debugEnabled && Boolean(document.querySelector('#developer-controls [name="wireframe"]')?.checked),lightingDebug:debugEnabled?Number(document.querySelector('#developer-controls [name="lighting"]')?.value)||0:0});
  }
  if(playing)audio.update(dt,player,environment,{speed:player.speed,grounded:player.grounded,interior:player.position[1]<-1 || ['home','workshop','clinic'].includes(currentLocation().id),riding:player.riding});
  drawNavigation();
  uiClock+=dt;
  if(uiClock>.14){uiClock=0;nearby=playing?closestInteraction():nearby;refreshUi();ui.setPerformance(collectStats(),performanceEnabled);if(debugEnabled)refreshDebug();}
  metrics.cpuMs=performance.now()-cpuStart;
  if(!disposal && mode!=='error' && renderer.ready)frameRequest=requestAnimationFrame(frame);
  } catch(error) {fatal(error.message || String(error));}
}

function drawNavigation() {
  const width=innerWidth,height=innerHeight,dpr=Math.min(devicePixelRatio || 1,2);
  if(overlay.width!==Math.round(width*dpr)||overlay.height!==Math.round(height*dpr)){overlay.width=Math.round(width*dpr);overlay.height=Math.round(height*dpr);}
  const ctx=overlayContext;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  if(debugEnabled && document.querySelector('#developer-controls [name="people"]')?.checked){
    for(const actor of population.nearby(player.position,48).slice(0,80)){
      const point=projectPoint([actor.position[0],actor.position[1]+2.2,actor.position[2]],camera,width,height);
      if(!point || point.x<10 || point.x>width-10 || point.y<10 || point.y>height-10)continue;
      const label=`${actor.name || actor.role} · ${actor.speed.toFixed(1)} m/s`;
      ctx.font='13px system-ui';ctx.textAlign='center';ctx.fillStyle='#0c151c';
      const w=ctx.measureText(label).width;ctx.fillRect(point.x-w/2-5,point.y-14,w+10,21);ctx.fillStyle='#d1f3e7';ctx.fillText(label,point.x,point.y);
    }
  }
  if(mode!=='playing'||ui.isOpen||debugEnabled)return;
  const targets=[];
  if(objective)targets.push({position:objective.position,label:objective.name || objective.label,color:'#d7b77d',distance:objective.distance});
  if(waypoint)targets.push({position:waypoint,label:'Waypoint',color:'#9bcab8',distance:distance(player.position,waypoint)});
  if(scannerTime>0){
    const effects=game.getEquipmentEffects?.() || {};
    for(const item of world.interactables){const d=distance(player.position,item.position);if(d<(effects.scanRadius || 28)&&item.id!==objective?.target)targets.push({position:item.position,label:item.name,color:'#9bcab8',distance:d,small:true});}
    ctx.strokeStyle=`rgba(139,203,174,${scannerTime/32})`;ctx.lineWidth=1;
    const radius=((renderTime*100)%Math.max(width,height));ctx.beginPath();ctx.arc(width/2,height/2,radius,0,Math.PI*2);ctx.stroke();
  }
  for(const item of targets){
    const p=projectPoint([item.position[0],item.position[1]+2.15,item.position[2]],camera,width,height);
    if(!p || p.x<25 || p.x>width-25 || p.y<75 || p.y>height-75)continue;
    if(item.distance<2.5 && item.small)continue;
    const size=item.small?4:6;ctx.strokeStyle=item.color;ctx.lineWidth=1.3;
    ctx.beginPath();ctx.moveTo(p.x,p.y-size);ctx.lineTo(p.x+size,p.y);ctx.lineTo(p.x,p.y+size);ctx.lineTo(p.x-size,p.y);ctx.closePath();ctx.stroke();
    ctx.font=item.small?'12px system-ui':'13px system-ui';ctx.textAlign='center';ctx.textBaseline='top';
    const text=item.small?item.label:`${item.label} · ${Math.round(item.distance)} m`;
    const w=ctx.measureText(text).width;ctx.fillStyle='rgba(13,21,18,.7)';ctx.fillRect(p.x-w/2-6,p.y+10,w+12,21);ctx.fillStyle=item.color;ctx.fillText(text,p.x,p.y+13);
  }
  if(security.exposure>.05){ctx.fillStyle=`rgba(176,58,33,${security.exposure*.16})`;ctx.fillRect(0,0,width,height);ctx.fillStyle='#e6ad8c';ctx.font='14px system-ui';ctx.textAlign='center';ctx.fillText(`SURVEILLANCE · ${Math.round(security.exposure*100)}%`,width/2,105);}
}

function toggleDebug(force) {
  debugEnabled=typeof force==='boolean'?force:!debugEnabled;
  let dev=document.getElementById('developer-controls');
  if(!debugEnabled){dev?.remove();player.freeCamera=false;resume();return;}
  pauseInput();
  if(dev)return;
  dev=document.createElement('aside');dev.id='developer-controls';
  Object.assign(dev.style,{position:'fixed',top:'12px',right:'12px',width:'min(330px, calc(100vw - 24px))',maxHeight:'calc(100vh - 24px)',overflow:'auto',background:'rgba(12,21,18,.97)',color:'#d6e8dd',padding:'22px',font:'14px/1.55 system-ui',zIndex:60,boxShadow:'0 10px 70px #0008'});
  dev.innerHTML=`<h2 style="margin:0 0 18px;font-size:18px">Development controls</h2><label>World time <input name="hour" type="range" min="0" max="23.99" step=".1" value="${environment.hour}" style="width:100%"></label><label>Weather <select name="weather"><option value="clear">Clear</option><option value="overcast">Overcast</option><option value="rain">Rain</option></select></label><p><label><input name="freeze" type="checkbox"> Freeze world clock</label><br><label><input name="free" type="checkbox"> Free camera (Space up, C down)</label><br><label><input name="colliders" type="checkbox"> Collision geometry</label><br><label><input name="cells" type="checkbox"> World cells</label><br><label><input name="people" type="checkbox"> Population bounds and headings</label><br><label><input name="wireframe" type="checkbox"> Mesh edges</label><br><label><input name="perf" type="checkbox"> Performance measurements</label></p><label>Lighting inspection <select name="lighting"><option value="0">Lit scene</option><option value="1">Surface normals</option><option value="2">Base colours</option><option value="3">Sunlight and shadows</option></select></label><br><label>Detail inspection <select name="detail"><option value="2">All geometry</option><option value="1">Architecture and façades</option><option value="0">Structural geometry</option></select></label><p><label>Teleport <select name="teleport"><option value="">Choose location</option></select></label></p><button name="spawn">Add nearby pedestrian</button><button name="recover">Return to safe address</button><pre id="developer-stats" style="font:12px/1.5 monospace;white-space:pre-wrap"></pre><button name="close">Close · F4</button>`;
  document.body.appendChild(dev);
  dev.querySelector('[name="weather"]').value=environment.weather;
  for(const loc of world.locations){const o=document.createElement('option');o.value=loc.id;o.textContent=loc.name;dev.querySelector('[name="teleport"]').appendChild(o);}
  dev.addEventListener('input',e=>{
    const el=e.target;
    if(el.name==='hour')game.data.world.hour=Number(el.value);
    else if(el.name==='weather')game.data.world.weather=el.value;
    else if(el.name==='freeze')worldClockFrozen=el.checked;
    else if(el.name==='free'){player.freeCamera=el.checked;if(el.checked){input.enabled=true;canvas.focus();input.requestLock();}}
    else if(el.name==='perf')performanceEnabled=el.checked;
    else if(el.name==='detail'){detailLevel=Number(el.value);uploadVisibleWorld();}
    else if(el.name==='teleport'&&el.value){const loc=world.locations.find(i=>i.id===el.value);player.restore({position:loc.position,yaw:player.yaw,pitch:0});}
  });
  dev.querySelector('[name="close"]').onclick=()=>toggleDebug(false);
  dev.querySelector('[name="recover"]').onclick=()=>player.restore({position:player.checkpoint,yaw:0,pitch:0});
  dev.querySelector('[name="spawn"]').onclick=()=>{if(population.spawn)population.spawn('resident',player.position);else ui.toast('Population follows the district’s available navigation nodes.');};
}

function refreshDebug() {
  const el=document.getElementById('developer-stats');if(!el)return;
  const s=collectStats();
  el.textContent=`Position ${player.position.map(v=>v.toFixed(1)).join(', ')}\nHour ${environment.hour.toFixed(2)}\nSun ${environment.sunDirection?.map(v=>v.toFixed(2)).join(', ')}\nBackend ${s.backend || 'WebGPU'}\nFrame ${s.frameMs.toFixed(1)} ms\nCPU ${s.cpuMs.toFixed(1)} ms\nGPU ${s.gpuMs==null?'timestamp unavailable':s.gpuMs.toFixed(1)+' ms'}\nDraw calls ${s.drawCalls ?? '—'}\nInstances ${s.instances ?? world.instances.length}\nVisible ${s.visibleObjects ?? '—'}\nTriangles ${s.triangles ?? '—'}\nCells ${s.loadedCells}\nPeople ${s.npcCount ?? '—'}\nGPU allocation ~${((s.memoryBytes || 0)/1048576).toFixed(1)} MiB\nGeneration ${metrics.generationMs.toFixed(0)} ms`;
}

function exposeDevelopmentApi() {
  window.__ASTRA__={
    version:'1.1.0',ready:true,renderer,game,world,worldStream,collision,player,population,navigation,security,ui,errors,metrics,
    getStats:collectStats,getMode:()=>mode,getObjective:()=>objective,getNearby:closestInteraction,
    save:()=>saveGame(false),load:()=>{const ok=game.load();if(ok){player.restore(game.data.player);syncOpenedDoors();}return ok;},
    start:()=>startGame(false),interact,onAction,
    teleport:id=>{const p=typeof id==='string'?(world.interactables.find(i=>i.id===id)?.position || world.locations.find(i=>i.id===id)?.position):id;if(!p)return false;player.restore({position:[...p],yaw:player.yaw,pitch:0});worldStream.update(player.position,{force:true});return true;},
    renderAt:async(position,yaw,pitch=0)=>{player.restore({position,yaw,pitch});mode='playing';ui.setPlaying(true);ui.closePanel();camera=player.camera(game.data.settings.fov);worldStream.update(position,{force:true});await worldStream.whenSettled();await renderer.device.queue.onSubmittedWorkDone();renderer.render(camera,environment,{quality:game.data.settings.quality,renderScale:adaptiveScale});return collectStats();},
    dispose:()=>{disposal=true;cancelAnimationFrame(frameRequest);disposeAgentTools();input.destroy();audio.dispose();population.dispose();worldStream?.dispose();renderer.dispose();ui.destroy();}
  };
}

document.addEventListener('visibilitychange',()=>{if(document.hidden){saveGame(false);if(started && mode==='playing' && !ui.isOpen)openPanel('pause');}});
window.addEventListener('pagehide',()=>saveGame(false));
window.addEventListener('resize',()=>renderer.resize(adaptiveScale));
init();
