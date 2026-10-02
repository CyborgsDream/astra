/** Optional page-scoped WebMCP support. Normal browser play has no dependency on it. */
export function registerWardTools({document,game,world,getPlayer,getMode,setWaypoint}) {
  const context=document?.modelContext;
  if(typeof context?.registerTool!=='function')return ()=>{};
  const lifecycle=new AbortController();
  const register=tool=>{
    try { Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{}); }
    catch { /* An unavailable optional registry must not interrupt the game. */ }
  };
  register({
    name:'inspect_ward_progress',title:'Inspect ASTRA CITY progress',
    description:'Read the current district, player position, accepted missions and available map destinations without changing the journey.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},
    annotations:{readOnlyHint:true,untrustedContentHint:false},
    execute(input={}) {
      if(!input || Array.isArray(input) || typeof input!=='object' || Object.keys(input).length)throw new Error('This tool accepts an empty object.');
      const player=getPlayer();
      return {district:world.name || 'Switchback Ward',mode:getMode(),position:[...player.position],credits:game.data.player.credits,quests:game.getQuestView().map(q=>({id:q.id,title:q.title,status:q.status,objective:q.objective})),destinations:world.locations.map(l=>({id:l.id,name:l.name})),ending:game.data.world.ending?.title || null};
    }
  });
  register({
    name:'set_ward_waypoint',title:'Set an ASTRA CITY map waypoint',
    description:'Set the visible in-game map waypoint to one known district location. This changes navigation guidance and does not move the player or complete work.',
    inputSchema:{type:'object',properties:{locationId:{type:'string'}},required:['locationId'],additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:false},
    async execute(input) {
      if(!input || Array.isArray(input) || typeof input!=='object' || Object.keys(input).some(k=>k!=='locationId') || typeof input.locationId!=='string')throw new Error('Provide one locationId.');
      if(getMode()!=='playing')throw new Error('Start or continue the journey before setting a waypoint.');
      const location=world.locations.find(l=>l.id===input.locationId);
      if(!location)throw new Error('Unknown district location. Inspect progress to list available destinations.');
      await setWaypoint([...location.position]);
      return {locationId:location.id,name:location.name,position:[...location.position],waypointSet:true};
    }
  });
  return ()=>lifecycle.abort();
}
