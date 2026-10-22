/** Grok Bot webhook handoff. No login credentials or assets are sent. */
const HEADERS={'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const ok=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:HEADERS});
const bad=(message,status=400)=>ok({error:message},status);
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const statuses=new Set(['prepared','needs_approval','published_unverified','submitted_unverified','blocked','failed','done']);
function equal(a,b){
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
}
async function json(req,max=2400){
 if(!/^application\/json/i.test(req.headers.get('content-type')||''))throw Error('JSON body required');
 const s=await req.text();if(s.length>max)throw Error('Request too long');
 const value=JSON.parse(s);
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('JSON object required');
 return value;
}
async function queueJob(env,id){
 if(!UUID.test(id))return bad('Valid job ID required');
 const job=await env.DB.prepare(`SELECT j.id,j.campaign_id,j.status,j.actions_run_url,j.created_at,
     c.url campaign_url,t.enabled approved
     FROM jobs j JOIN campaigns c ON c.id=j.campaign_id
     JOIN trusted_campaigns t ON t.campaign_id=j.campaign_id
     WHERE j.id=?`).bind(id).first();
 if(!job||job.status!=='ready_for_review'||!job.approved)return bad('Only rendered jobs from explicitly approved profiles can be handed to Grok Bot',409);
 if(!job.actions_run_url||!/^https:\/\/github\.com\/amiddlebrook\/Clipfleet\/actions\/runs\/\d+$/.test(job.actions_run_url))
  return bad('Render must have a valid GitHub Actions artifact link',409);
 const used=await env.DB.prepare('SELECT id FROM campaign_submissions WHERE job_id=?').bind(id).first();
 if(used)return bad('Already submitted job cannot be handed off',409);
 const timestamp=new Date().toISOString();
 const created=await env.DB.prepare(`INSERT OR IGNORE INTO bot_tasks(id,job_id,campaign_id,queued_at,updated_at)
   VALUES(?,?,?,?,?) RETURNING id`).bind(crypto.randomUUID(),job.id,job.campaign_id,timestamp,timestamp).first();
 const existing=await env.DB.prepare('SELECT * FROM bot_tasks WHERE job_id=?').bind(id).first();
 return ok({queued:Boolean(created),task:existing,non_autonomous:'This task requests an operator-safe review; publication and Content Rewards submission still require authorization.'},created?201:200);
}
export async function autoQueueGrokBot(env,jobId){
 // Best effort: missing Actions link prevents handoff without affecting a finished render.
 const response=await queueJob(env,jobId);
 if(response.status!==201)console.log('Grok Bot handoff not queued',response.status,jobId);
}
export async function grokBotReport(req,env,path){
 if(path!=='/api/grokbot/report')return null;
 if(req.method!=='POST')return bad('Method not allowed',405);
 if(!env.GROKBOT_CALLBACK_TOKEN||env.GROKBOT_CALLBACK_TOKEN.length<32)return bad('Callback not configured',503);
 if(!equal(req.headers.get('authorization'),`Bearer ${env.GROKBOT_CALLBACK_TOKEN}`))return bad('Unauthorized',401);
 let data;try{data=await json(req);}catch{return bad('Invalid JSON payload');}
 const id=String(data.task_id||''),action=String(data.action||'');
 if(!UUID.test(id)||!statuses.has(action))return bad('Invalid task ID/action');
 const note=typeof data.note==='string'?data.note.trim().slice(0,700):'';
 const timestamp=new Date().toISOString();
 const next=action==='failed'?'failed':action==='blocked'?'blocked':'reported';
 // The Bot reports what it observed. This never updates workflow completion,
 // creator credentials, source rights or publisher/payment verification.
 const record=await env.DB.prepare(`UPDATE bot_tasks SET status=?,reported_action=?,note=?,updated_at=?
   WHERE id=? AND status='accepted' RETURNING id,status,reported_action`)
   .bind(next,action,note,timestamp,id).first();
 if(!record)return bad('Task not found or not awaiting Bot report',409);
 return ok({recorded:true,task:record,verified_submission:false,verified_payout:false});
}
export async function grokBotAdmin(req,env,path){
 if(!path.startsWith('/api/grokbot/'))return null;
 if(path==='/api/grokbot/tasks'&&req.method==='GET'){
  const rows=await env.DB.prepare(`SELECT b.id,b.job_id,b.campaign_id,b.status,b.reported_action,b.note,b.attempts,b.webhook_http_status,
      b.queued_at,b.dispatched_at,b.updated_at,j.actions_run_url,c.title,c.url campaign_url
      FROM bot_tasks b JOIN jobs j ON j.id=b.job_id JOIN campaigns c ON c.id=b.campaign_id
      ORDER BY b.queued_at DESC LIMIT 60`).all();
  return ok({tasks:rows.results||[],callback_configured:Boolean(env.GROKBOT_CALLBACK_TOKEN)});
 }
 if(path==='/api/grokbot/queue'&&req.method==='POST'){
  let data;try{data=await json(req);}catch{return bad('Invalid JSON payload');}
  return queueJob(env,String(data.job_id||''));
 }
 if(path==='/api/grokbot/claim'&&req.method==='POST'){
  let data;try{data=await json(req);}catch{return bad('Invalid JSON payload');}
  const requested=Number(data.max||1);
  if(!Number.isInteger(requested)||requested<1||requested>2)return bad('Maximum two webhook handoffs per run');
  const claimed=[];
  for(let i=0;i<requested;i++){
   const t=await env.DB.prepare(`UPDATE bot_tasks SET status='dispatching',attempts=attempts+1,updated_at=?
    WHERE id=(SELECT id FROM bot_tasks WHERE status='queued' AND attempts<4 ORDER BY queued_at LIMIT 1)
      AND status='queued'
    RETURNING id,job_id,campaign_id,attempts`).bind(new Date().toISOString()).first();
   if(!t)break;
   const details=await env.DB.prepare(`SELECT j.actions_run_url,c.title,c.url campaign_url,j.output_sha256
     FROM jobs j JOIN campaigns c ON c.id=j.campaign_id WHERE j.id=?`).bind(t.job_id).first();
   claimed.push({...t,title:details?.title||'',campaign_url:details?.campaign_url||'',actions_run_url:details?.actions_run_url||'',output_sha256:details?.output_sha256||''});
  }
  return ok({tasks:claimed,meaning:'Webhook dispatch acceptance is not Bot task completion.'});
 }
 if(path==='/api/grokbot/dispatch-result'&&req.method==='POST'){
  let data;try{data=await json(req);}catch{return bad('Invalid JSON payload');}
  const id=String(data.task_id||''),status=Number(data.http_status||0);
  if(!UUID.test(id)||!Number.isInteger(status)||status<0||status>599)return bad('Invalid task ID or HTTP status');
  const accepted=status===200;
  // Do not retry ambiguous 2xx or network timeouts automatically; a Bot may already be running.
  const next=accepted?'accepted':'failed';
  const row=await env.DB.prepare(`UPDATE bot_tasks SET status=?,webhook_http_status=?,dispatched_at=?,updated_at=?
    WHERE id=? AND status='dispatching' RETURNING id,status`)
    .bind(next,status||null,new Date().toISOString(),new Date().toISOString(),id).first();
  if(!row)return bad('Task not dispatching',409);
  return ok({task:row,accepted,bot_finished:false});
 }
 if(path==='/api/grokbot/requeue'&&req.method==='POST'){
  let data;try{data=await json(req);}catch{return bad('Invalid JSON payload');}
  const id=String(data.task_id||'');
  if(!UUID.test(id)||data.confirm!==true)return bad('Explicit confirmed task ID required');
  // Only failed requests with a definite non-200 may be retried. Never double-dispatch accepted runs.
  const row=await env.DB.prepare(`UPDATE bot_tasks SET status='queued',updated_at=?
   WHERE id=? AND status='failed' AND webhook_http_status IS NOT NULL AND webhook_http_status != 200 AND attempts < 4
   RETURNING id,status`).bind(new Date().toISOString(),id).first();
  if(!row)return bad('Task is not safely retryable. Inspect the Grok Bot run and its actions.',409);
  return ok({task:row});
 }
 return bad('Unknown Grok Bot operation',404);
}
