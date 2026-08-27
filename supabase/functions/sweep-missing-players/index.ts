import{adminClient as w,replayRoom as x,chainResolveAiTurns as E,gameReducer as R}from"../_shared/gameRoom.ts";const K={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-cron-secret","Access-Control-Allow-Methods":"POST, OPTIONS"};
// Auth: compared against public.vm_app_config's 'sweep_cron_secret' row (service-role
// read, RLS-locked to everyone else) rather than a Deno.env var — see that table's
// migration comment for why. If the row is somehow missing, fail CLOSED (401), not open.
async function checkSecret(o,f){const{data:s}=await o.from("vm_app_config").select("value").eq("key","sweep_cron_secret").maybeSingle();return!!s?.value&&f.headers.get("x-cron-secret")===s.value}
Deno.serve(async f=>{
  if(f.method==="OPTIONS")return new Response("ok",{headers:K});
  const o=w();
  if(!await checkSecret(o,f))return new Response("Unauthorized",{status:401,headers:K});
  const{data:_,error:l}=await o.from("vm_rooms").select("id, rng_seed, turn_timeout_minutes, break_until").eq("status","active");
  if(l)return new Response(JSON.stringify({error:l.message}),{status:500,headers:{"Content-Type":"application/json",...K}});
  const n=[];
  for(const e of _??[]){
    if(e.turn_timeout_minutes==null){n.push({roomId:e.id,skipped:"room set to never time out"});continue}
    const{data:r}=await o.from("vm_moves").select("seq, action, created_at").eq("room_id",e.id).order("seq",{ascending:!0});
    if(!r||r.length===0){n.push({roomId:e.id,skipped:"not started"});continue}
    const breakUntilMs=e.break_until?new Date(e.break_until).getTime():0,nowMs=Date.now();
    if(breakUntilMs>nowMs){n.push({roomId:e.id,skipped:`on a break until ${e.break_until}`});continue}
    const lastMoveMs=new Date(r[r.length-1].created_at).getTime(),effectiveSinceMs=Math.max(lastMoveMs,breakUntilMs),idleMin=(nowMs-effectiveSinceMs)/6e4,takeoverThreshold=e.turn_timeout_minutes*2;
    if(idleMin<takeoverThreshold){n.push({roomId:e.id,skipped:`only ${idleMin.toFixed(1)}m idle (takes ${takeoverThreshold}m: warned at ${e.turn_timeout_minutes}m, converts at ${takeoverThreshold}m)`});continue}
    const t=x(e.rng_seed,r);
    let i=null;
    if(t.status==="exitOffer"?i=t.pendingExitOffer?.playerId??null:t.status==="playing"&&(i=t.players[t.activePlayerIndex]?.id??null),!i){n.push({roomId:e.id,skipped:"nobody currently blocking"});continue}
    const p=t.players.findIndex(s=>s.id===i),u=t.players[p];
    if(!u||u.type!=="human"){n.push({roomId:e.id,skipped:"blocking seat is already AI"});continue}
    const m={type:"CONVERT_SEAT_TO_AI",playerId:i};
    let a=R(t,m);
    const h=(a.log??[]).slice((t.log??[]).length),g=r.length;
    await o.from("vm_moves").insert({room_id:e.id,seq:g,seat_index:p,action:m,resulting_log_entries:h});
    a=await E(o,e.id,a,g+1);
    const I=a.players.map((s,d)=>({i:d,p:s})).filter(({p:s})=>s.type==="ai");
    for(const{i:s,p:d}of I)await o.from("vm_room_seats").update({bot_personality_id:d.personalityId}).eq("room_id",e.id).eq("seat_index",s);
    a.status==="gameover"&&await o.from("vm_rooms").update({status:"finished"}).eq("id",e.id);
    // A conversion clears any stale break_until so the (now-AI) seat's next
    // human successor, if any, doesn't inherit an unrelated grace window.
    await o.from("vm_rooms").update({break_until:null}).eq("id",e.id);
    n.push({roomId:e.id,convertedPlayerId:i});
  }
  return new Response(JSON.stringify({results:n}),{headers:{"Content-Type":"application/json",...K}});
});
