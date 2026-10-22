/* ClipFleet connection hub: navigation + explicit user-supplied confirmations.
 * Completion markers never represent verified third-party OAuth.
 */
const KEYS=new Set(['contentrewards','whop','grokbot','grokbot_webhook','youtube','tiktok','instagram','x']);
const H={'content-type':'application/json;charset=utf-8','cache-control':'no-store'};
const send=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:H});
const err=(message,status=400)=>send({error:message},status);
function json(req){
 if(!/^application\/json\b/i.test(req.headers.get('content-type')||''))throw Error('JSON required');
 return req.text().then(t=>{
  if(t.length>900)throw Error('Request too large');
  const v=JSON.parse(t);if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Expected object');
  return v;
 });
}
export async function onboardingRoute(req,env,path){
 if(path==='/api/onboarding'&&req.method==='GET'){
  const [rows,presets,botTasks]=await Promise.all([
   env.DB.prepare('SELECT step_id,completed,updated_at FROM onboarding_steps').all(),
   env.DB.prepare("SELECT platform,COUNT(*) n FROM social_presets WHERE confirmed_connected=1 GROUP BY platform").all(),
   env.DB.prepare("SELECT COUNT(*) n,SUM(CASE WHEN status IN ('accepted','reported') THEN 1 ELSE 0 END) accepted FROM bot_tasks").first()
  ]);
  const counts=Object.fromEntries((presets.results||[]).map(x=>[x.platform,Number(x.n)]));
  const steps=Object.fromEntries((rows.results||[]).map(r=>[r.step_id,{completed:!!r.completed,updated_at:r.updated_at,verification:'self_reported'}]));
  return send({steps,social_presets:counts,
   grokbot_tasks:{total:Number(botTasks?.n||0),accepted:Number(botTasks?.accepted||0)},
   platform_note:'All marked-complete states are your own confirmations. No third-party login, payout, social ownership, or webhook-credential validation is performed here.'});
 }
 if(path==='/api/onboarding'&&req.method==='POST'){
  let data;try{data=await json(req);}catch{return err('Invalid checklist request');}
  const id=String(data.step_id||'').toLowerCase();
  if(!KEYS.has(id)||typeof data.completed!=='boolean'||data.confirm!==true)return err('Explicit confirmation and valid account step required');
  if(data.completed&&['youtube','tiktok','instagram','x'].includes(id)){
   const preset=await env.DB.prepare('SELECT id FROM social_presets WHERE platform=? AND confirmed_connected=1 LIMIT 1').bind(id).first();
   if(!preset)return err('First save your own '+id+' social-account preset after verifying it inside Content Rewards',409);
  }
  // The server records no private authentication tokens, external usernames, or uploaded screenshots.
  const changed=await env.DB.prepare(`INSERT INTO onboarding_steps(step_id,completed,updated_at) VALUES(?,?,?)
    ON CONFLICT(step_id) DO UPDATE SET completed=excluded.completed,updated_at=excluded.updated_at
    RETURNING step_id,completed,updated_at`).bind(id,data.completed?1:0,new Date().toISOString()).first();
  return send({step:{step_id:changed.step_id,completed:!!changed.completed,updated_at:changed.updated_at,
    verification:'self_reported'},externally_verified:false});
 }
 return null;
}
