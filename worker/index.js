/** ClipFleet Cloudflare Worker API. Free-tier D1, no paid external services. */
const JSON_HEADERS = {'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; frame-ancestors 'none'"};
const uuidPattern=/\/c\/campaigns\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/ig;
function out(value,status=200){return new Response(JSON.stringify(value),{status,headers:JSON_HEADERS});}
function err(msg,status=400){return out({error:msg},status);}
function eq(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);return v===0;}
async function body(request){if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')||''))throw Error('JSON Content-Type required');const data=await request.text();if(data.length>100_000)throw Error('Body too large');const json=JSON.parse(data);if(!json||typeof json!=='object'||Array.isArray(json))throw Error('Expected JSON object');return json;}
async function plan(env){
  // One profile is manually reviewed once; bounded creative variants are then planned autonomously.
  const rows=(await env.DB.prepare(`SELECT t.campaign_id,t.payload,t.max_variants,c.accepting,c.budget_remaining,c.detail_checked_at
    FROM trusted_campaigns t JOIN campaigns c ON t.campaign_id=c.id WHERE t.enabled=1`).all()).results;
  const now=new Date(), today=now.toISOString().slice(0,10);
  const todays=await env.DB.prepare('SELECT COUNT(*) AS n FROM jobs WHERE created_at >= ?').bind(today).first();
  let slots=Math.max(0,6-Number(todays?.n||0)),planned=0;
  for(const row of rows){
    if(slots<=0)break;
    // Do not run on unverified, inactive, exhausted or stale listings. Re-check each run.
    if(!row.accepting||!(row.budget_remaining>=20)||!row.detail_checked_at||Date.now()-Date.parse(row.detail_checked_at)>12*3600_000)continue;
    const profile=JSON.parse(row.payload);
    if(!profile.verified_eligibility||!profile.assets_licensed||!profile.brief_reviewed||!profile.rights_evidence)continue;
    const existing=await env.DB.prepare('SELECT COUNT(*) AS n FROM jobs WHERE campaign_id=?').bind(row.campaign_id).first();
    const taken=Number(existing.n);
    if(taken>=row.max_variants)continue;
    const create=Math.min(slots,row.max_variants-taken);
    for(let index=0;index<create;index++){
      const payload={...profile,variant:taken+index,campaign_id:row.campaign_id};
      const id=crypto.randomUUID();
      await env.DB.prepare('INSERT INTO jobs(id,campaign_id,payload,status,created_at) VALUES(?,?,?,?,?)').bind(id,row.campaign_id,JSON.stringify(payload),'queued',now.toISOString()).run();
      slots--;planned++;
    }
  }
  return {planned,remaining_daily_capacity:slots};
}
async function feed(env){
 const urls=['https://contentrewards.com/c/discover','https://whop.com/contentrewards/'];
 const seen=new Set();const found=[];
 for(const source of urls){
  try{
   const response=await fetch(source,{headers:{'accept':'text/html','user-agent':'ClipFleet/0.1'},redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!response.ok)continue;
   const html=(await response.text()).slice(0,350000);
   const normalized=html.replaceAll('\\u002F','/').replaceAll('\\/','/');
   for(const match of normalized.matchAll(uuidPattern)){
    const id=match[1].toLowerCase();if(seen.has(id))continue;seen.add(id);found.push({id,url:`https://contentrewards.com/c/campaigns/${id}`,source});
    if(found.length>=150)break;
   }
  }catch(e){console.log('Campaign discovery source unreachable',source,String(e).slice(0,120));}
 }
 for(const c of found){
  await env.DB.prepare('INSERT INTO campaigns(id,url,source,discovered_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET source=excluded.source,last_seen_at=excluded.discovered_at')
   .bind(c.id,c.url,c.source,new Date().toISOString()).run();
 }
 return {discovered:found.length,sources_checked:urls.length};
}
async function handler(request,env){
 const path=new URL(request.url).pathname;
 if(path==='/api/health')return out({ok:true,app:'ClipFleet',posting:false,submission_api:false,public_discovery:true,admin_configured:Boolean(env.ADMIN_TOKEN)});
 if(path==='/api/campaigns'&&request.method==='GET'){
  const rows=await env.DB.prepare('SELECT * FROM campaigns ORDER BY priority_score DESC, last_seen_at DESC LIMIT 150').all();return out({campaigns:rows.results});
 }
 if(path==='/api/stats'&&request.method==='GET'){
  const campaigns=await env.DB.prepare('SELECT COUNT(*) n FROM campaigns').first();
  const active=await env.DB.prepare('SELECT COUNT(*) n FROM campaigns WHERE accepting=1 AND budget_remaining>=20').first();
  const queue=await env.DB.prepare("SELECT COUNT(*) n FROM jobs WHERE status='queued'").first();
  const ready=await env.DB.prepare("SELECT COUNT(*) n FROM jobs WHERE status='ready_for_review'").first();
  return out({campaigns:Number(campaigns?.n||0),active:Number(active?.n||0),queued:Number(queue?.n||0),ready:Number(ready?.n||0)});
 }
 if(!env.ADMIN_TOKEN)return err('Deployment missing ADMIN_TOKEN secret',503);
 if(!eq(request.headers.get('authorization'),`Bearer ${env.ADMIN_TOKEN}`))return err('Unauthorized',401);
 if(path==='/api/discover'&&request.method==='POST')return out(await feed(env));
 if(path==='/api/import'&&request.method==='POST'){
  const data=await body(request);
  if(!Array.isArray(data.campaigns)||data.campaigns.length>50)return err('Maximum 50 campaigns per import');
  let imported=0;
  for(const c of data.campaigns){
   if(!/^[0-9a-f-]{36}$/.test(c.id||''))continue;
   const rate=typeof c.rate==='number' && Number.isFinite(c.rate)?c.rate:null;
   const budget=typeof c.budget_remaining==='number'&&Number.isFinite(c.budget_remaining)?c.budget_remaining:null;
   await env.DB.prepare(`INSERT INTO campaigns(id,url,title,model,rate,budget_remaining,priority_score,accepting,source,discovered_at,last_seen_at,detail_checked_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,model=excluded.model,rate=excluded.rate,budget_remaining=excluded.budget_remaining,priority_score=excluded.priority_score,accepting=excluded.accepting,last_seen_at=excluded.last_seen_at,detail_checked_at=excluded.detail_checked_at`)
   .bind(c.id,`https://contentrewards.com/c/campaigns/${c.id}`,String(c.title||'').slice(0,180),['cpm','per_post','unknown'].includes(c.model)?c.model:'unknown',rate,budget,Math.max(0,Math.min(100,Number(c.priority_score||0))),c.accepting?1:0,'public_campaign_detail',new Date().toISOString(),new Date().toISOString(),new Date().toISOString()).run();
   imported++;
  }
  return out({imported});
 }
 if(path==='/api/plan'&&request.method==='POST')return out(await plan(env));
 if(path==='/api/profiles'&&request.method==='GET'){
  const rows=await env.DB.prepare('SELECT campaign_id,max_variants,enabled,reviewed_at FROM trusted_campaigns ORDER BY reviewed_at DESC').all();return out({profiles:rows.results});
 }
 if(path==='/api/profiles'&&request.method==='POST'){
  const data=await body(request);const cid=String(data.campaign_id||'').toLowerCase();
  if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(cid))return err('Valid campaign_id required');
  if(!data.verified_eligibility||!data.assets_licensed||!data.rights_evidence||!data.brief_reviewed)return err('Reviewed eligibility, licensed assets, rights evidence and brief required');
  if(!data.allows_original_graphic&&!data.source_video&&!data.source_video_url)return err('Must provide authorized footage or explicitly permitted graphic-only content');
  if(data.requires_preapproval&&!data.draft_approved)return err('Preapproved draft required; cannot skip brand approval');
  const row=await env.DB.prepare('SELECT id FROM campaigns WHERE id=?').bind(cid).first();if(!row)return err('Unknown campaign');
  const variants=Number(data.max_variants||2);if(!Number.isInteger(variants)||variants<1||variants>3)return err('1–3 unique versions allowed');
  await env.DB.prepare(`INSERT INTO trusted_campaigns(campaign_id,payload,max_variants,reviewed_at) VALUES(?,?,?,?)
    ON CONFLICT(campaign_id) DO UPDATE SET payload=excluded.payload,max_variants=excluded.max_variants,enabled=1,reviewed_at=excluded.reviewed_at`)
  .bind(cid,JSON.stringify(data),variants,new Date().toISOString()).run();
  return out({campaign_id:cid,armed:true,what_happens:'Plans up to 3 bounded render jobs only. No posting or payout submission.'},201);
 }
 if(path==='/api/jobs'&&request.method==='GET'){
  const rows=await env.DB.prepare('SELECT id,campaign_id,status,created_at,claimed_at,completed_at,error,output_sha256 FROM jobs ORDER BY created_at DESC LIMIT 100').all();return out({jobs:rows.results});
 }
 if(path==='/api/jobs'&&request.method==='POST'){
  const data=await body(request);
  const cid=String(data.campaign_id||'').toLowerCase();
  if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(cid))return err('Valid campaign_id required');
  if(!data.verified_eligibility||!data.assets_licensed||!data.rights_evidence||!data.brief_reviewed)return err('Must confirm account eligibility, rights evidence, and reviewed campaign brief');
  if(!data.allows_original_graphic&&!data.source_video&&!data.source_video_url)return err('Licensed campaign footage or express permission for graphic-only content required');
  if(data.requires_preapproval&&!data.draft_approved)return err('Draft must be approved before publishing');
  const row=await env.DB.prepare('SELECT id FROM campaigns WHERE id=?').bind(cid).first();
  if(!row)return err('Campaign must first be discovered/imported');
  const id=crypto.randomUUID();const now=new Date().toISOString();
  const payload={...data, campaign_id:cid};
  await env.DB.prepare('INSERT INTO jobs(id,campaign_id,payload,status,created_at) VALUES(?,?,?,?,?)').bind(id,cid,JSON.stringify(payload),'queued',now).run();
  return out({id,status:'queued',note:'Render queue only. No social publication or Content Rewards submission.'},201);
 }
 if(path==='/api/jobs/claim'&&request.method==='POST'){
  const req=await body(request);
  if(req.worker!=='github-actions')return err('Unsupported renderer');
  const claim=await env.DB.prepare(`UPDATE jobs SET status='rendering',claimed_at=? WHERE id=(SELECT id FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1) AND status='queued' RETURNING *`).bind(new Date().toISOString()).first();
  return out({job:claim||null});
 }
 const match=/^\/api\/jobs\/([0-9a-f-]{36})\/complete$/.exec(path);
 if(match&&request.method==='POST'){
  const data=await body(request);
  if(!['failed','ready_for_review'].includes(data.status))return err('Invalid completion status');
  const result=await env.DB.prepare(`UPDATE jobs SET status=?,completed_at=?,output_sha256=?,error=? WHERE id=? AND status='rendering' RETURNING id`).bind(data.status,new Date().toISOString(),String(data.output_sha256||'').slice(0,64),String(data.error||'').slice(0,200),match[1]).first();
  if(!result)return err('Job not found or not rendering',409);
  return out({id:match[1],status:data.status});
 }
 return err('Not found',404);
}
export default {
 async fetch(request,env){try{return await handler(request,env);}catch(e){console.error('Request failed',e);return err('Request failed',500);}},
 async scheduled(controller,env){if(controller.cron!=='5 */6 * * *')return;await feed(env);await plan(env);
  // Requeue renders left in-flight by a stopped CI runner; never auto-post duplicates.
  await env.DB.prepare("UPDATE jobs SET status='queued',claimed_at=NULL WHERE status='rendering' AND claimed_at < ?").bind(new Date(Date.now()-2*3600_000).toISOString()).run();
  // Only stale failed jobs are pruned. Preserve audit entries for the active pipeline.
  await env.DB.prepare("DELETE FROM jobs WHERE status='failed' AND completed_at < ?").bind(new Date(Date.now()-90*86400_000).toISOString()).run();
 }
};
