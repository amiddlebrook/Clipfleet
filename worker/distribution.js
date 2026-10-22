/** ClipFleet four-platform distribution matrix. A lane represents one distinct render
 * and a manual, creator-authorized publishing/submission workflow.
 */
const ID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const PLATFORMS=['youtube','tiktok','instagram','x'];
const PLAT_SET=new Set(PLATFORMS);
const H={'content-type':'application/json;charset=utf-8','cache-control':'no-store'};
const send=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:H});
const error=(reason,status=400)=>send({error:reason},status);
const timestamp=()=>new Date().toISOString();
async function input(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||''))throw Error('JSON Content-Type required');
 const text=await req.text();if(text.length>14000)throw Error('Body too large');
 const value=JSON.parse(text);
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('JSON object required');
 return value;
}
const state=raw=>{try{return JSON.parse(raw||'{}')||{};}catch{return {};}};
function publicUrl(input,platform){
 let u;try{u=new URL(input);}catch{return null;}
 if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 const host=u.hostname.toLowerCase().replace(/^www\./,''),p=u.pathname;
 let allowed=false;
 if(platform==='youtube')allowed=(host==='youtube.com'&&(/^\/shorts\/[A-Za-z0-9_-]{6,}/.test(p)||(p==='/watch'&&u.searchParams.has('v'))))||(host==='youtu.be'&&/^\/[A-Za-z0-9_-]{6,}/.test(p));
 if(platform==='tiktok')allowed=host==='tiktok.com'&&/^\/@[^/]+\/video\/\d+/.test(p);
 if(platform==='instagram')allowed=host==='instagram.com'&&/^\/reel\/[A-Za-z0-9_-]+/.test(p);
 if(platform==='x')allowed=(host==='x.com'||host==='twitter.com')&&/^\/[^/]+\/status\/\d+/.test(p);
 return allowed?u.href:null;
}
async function getTargets(env,cid){
 const query=`SELECT d.campaign_id,d.platform,d.preset_id,d.job_id,d.status,d.published_url,d.published_at,d.submitted_at,
   d.submission_reference,d.outcome,d.created_at,d.updated_at,
   s.handle,s.profile_url,s.confirmed_connected,
   j.status render_status,j.actions_run_url,j.error render_error,j.output_sha256
   FROM distribution_targets d
   JOIN social_presets s ON s.id=d.preset_id
   LEFT JOIN jobs j ON j.id=d.job_id
   WHERE d.campaign_id=? ORDER BY CASE d.platform WHEN 'youtube' THEN 0 WHEN 'tiktok' THEN 1 WHEN 'instagram' THEN 2 ELSE 3 END`;
 return (await env.DB.prepare(query).bind(cid).all()).results||[];
}
async function lookup(env,cid,platform){
 return env.DB.prepare('SELECT * FROM distribution_targets WHERE campaign_id=? AND platform=?').bind(cid,platform).first();
}
async function details(env,cid){
 const campaign=await env.DB.prepare('SELECT id,accepting,budget_remaining,detail_checked_at,url FROM campaigns WHERE id=?').bind(cid).first();
 const trust=await env.DB.prepare('SELECT payload,enabled FROM trusted_campaigns WHERE campaign_id=?').bind(cid).first();
 const workflow=await env.DB.prepare('SELECT state FROM campaign_workflows WHERE campaign_id=?').bind(cid).first();
 return {campaign,trust,progress:state(workflow?.state)};
}
export async function planDistribution(env,slots=6){
 let planned=0;
 const available=(await env.DB.prepare(`SELECT d.campaign_id,d.platform,d.preset_id,s.handle,t.payload,c.accepting,c.budget_remaining,c.detail_checked_at
    FROM distribution_targets d JOIN social_presets s ON s.id=d.preset_id
    JOIN trusted_campaigns t ON t.campaign_id=d.campaign_id AND t.enabled=1
    JOIN campaigns c ON c.id=d.campaign_id
    WHERE d.job_id IS NULL AND d.status='configured' AND s.confirmed_connected=1
    ORDER BY d.created_at ASC`).all()).results||[];
 const today=timestamp().slice(0,10);
 for(const row of available){
  if(planned>=slots)break;
  if(!row.accepting||!(row.budget_remaining>=20)||!row.detail_checked_at||Date.now()-Date.parse(row.detail_checked_at)>12*3600000)continue;
  const profile=state(row.payload);
  if(!profile.verified_eligibility||!profile.assets_licensed||!profile.brief_reviewed||!profile.rights_evidence)continue;
  if(profile.requires_preapproval&&!profile.draft_approved)continue;
  const saved=await env.DB.prepare('SELECT state FROM campaign_workflows WHERE campaign_id=?').bind(row.campaign_id).first();
  const verified=state(saved?.state);
  if(!verified.joined_at||!verified.brief_at||!verified.rights_at)continue;
  const id=crypto.randomUUID(),now=timestamp();
  const payload={...profile,allowed_platforms:[row.platform],target_platform:row.platform,
   posting_account_handle:row.handle,variant:PLATFORMS.indexOf(row.platform),
   campaign_id:row.campaign_id};
  const inserted=await env.DB.prepare(`INSERT INTO jobs(id,campaign_id,payload,status,created_at)
   SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM jobs WHERE created_at>=?)<6 RETURNING id`)
   .bind(id,row.campaign_id,JSON.stringify(payload),'queued',now,today).first();
  if(!inserted)break;
  const assigned=await env.DB.prepare(`UPDATE distribution_targets SET job_id=?,status='queued',updated_at=?
    WHERE campaign_id=? AND platform=? AND job_id IS NULL AND status='configured' RETURNING job_id`)
   .bind(id,now,row.campaign_id,row.platform).first();
  if(!assigned){
   await env.DB.prepare('DELETE FROM jobs WHERE id=? AND status=?').bind(id,'queued').run();
   continue;
  }
  planned++;
 }
 return {planned,capacity:6,per_run_limit:slots,dispatched_to_social:false};
}
export async function distributionRoute(req,env,path,url){
 if(!path.startsWith('/api/distribution'))return null;
 if(path==='/api/distribution'&&req.method==='GET'){
  const cid=String(url.searchParams.get('campaign_id')||'').toLowerCase();
  if(!ID.test(cid))return error('Select a valid campaign');
  const campaign=await env.DB.prepare('SELECT id,url,title,accepting,budget_remaining,detail_checked_at FROM campaigns WHERE id=?').bind(cid).first();
  if(!campaign)return error('Unknown campaign',404);
  const submissions=(await env.DB.prepare(`SELECT id,job_id,platform,published_url,published_at,submitted_at,submission_reference,outcome
    FROM campaign_submissions WHERE campaign_id=? ORDER BY submitted_at DESC LIMIT 100`).bind(cid).all()).results||[];
  return send({campaign,lanes:await getTargets(env,cid),submissions,
    note:'Each platform is a separate authorized render and self-reported submission. Nothing automatically publishes or submits.'});
 }
 let data;
 if(req.method==='POST'){
  try{data=await input(req);}catch{return error('Invalid JSON request');}
 }
 if(path==='/api/distribution/setup'&&req.method==='POST'){
  const cid=String(data.campaign_id||'').toLowerCase();
  if(!ID.test(cid)||data.confirm!==true||!Array.isArray(data.lanes)||!data.lanes.length||data.lanes.length>4)
   return error('Campaign, 1–4 verified lanes and explicit confirmation required');
  const {campaign,trust,progress}=await details(env,cid);
  if(!campaign||!trust?.enabled)return error('Authorize a campaign profile first',409);
  if(!progress.joined_at||!progress.brief_at||!progress.rights_at||!progress.social_at)return error('Complete joined, social, brief and rights milestones first',409);
  const profile=state(trust.payload);
  if(!profile.verified_eligibility||!profile.assets_licensed||!profile.brief_reviewed||!profile.rights_evidence)return error('Campaign must have reviewed account eligibility and media rights',409);
  if(profile.requires_preapproval&&!profile.draft_approved)return error('Brand pre-approval must be complete before production',409);
  const used=new Set(),validated=[];
  for(const lane of data.lanes){
   if(!lane||!PLAT_SET.has(lane.platform)||used.has(lane.platform)||!ID.test(String(lane.preset_id||''))||lane.campaign_permits_platform!==true)
    return error('Each unique platform requires an approved linked social account and campaign-specific permission');
   const p=await env.DB.prepare('SELECT id,platform,handle,confirmed_connected FROM social_presets WHERE id=?').bind(lane.preset_id).first();
   if(!p||p.platform!==lane.platform||!p.confirmed_connected)return error('Selected preset does not match a user-verified account');
   const current=await lookup(env,cid,lane.platform);
   if(current?.job_id&&current.preset_id!==lane.preset_id)return error('Cannot change a social account after its clip was rendered',409);
   used.add(lane.platform);validated.push({platform:lane.platform,preset_id:lane.preset_id});
  }
  const now=timestamp();
  for(const lane of validated){
   await env.DB.prepare(`INSERT INTO distribution_targets(campaign_id,platform,preset_id,status,created_at,updated_at)
     VALUES(?,?,?,?,?,?) ON CONFLICT(campaign_id,platform) DO UPDATE SET
       preset_id=CASE WHEN distribution_targets.job_id IS NULL THEN excluded.preset_id ELSE distribution_targets.preset_id END,
       updated_at=excluded.updated_at`)
    .bind(cid,lane.platform,lane.preset_id,'configured',now,now).run();
  }
  return send({configured:validated.map(x=>x.platform),lanes:await getTargets(env,cid),
   next:'Plan separate, platform-targeted renders. Do not publish before review.'},201);
 }
 if(path==='/api/distribution/plan'&&req.method==='POST'){
  if(data.confirm!==true)return error('Explicit confirmation required');
  return send(await planDistribution(env,4));
 }
 if(path==='/api/distribution/progress'&&req.method==='POST'){
  const cid=String(data.campaign_id||'').toLowerCase(),platform=String(data.platform||'').toLowerCase(),action=String(data.action||'');
  if(!ID.test(cid)||!PLAT_SET.has(platform)||data.confirm!==true)return error('Select a platform and explicitly confirm your actual action');
  const lane=await lookup(env,cid,platform);
  if(!lane)return error('Configure this campaign/platform lane first',404);
  const now=timestamp(),newStatus={review:'reviewed',published:'published',submitted:'submitted'}[action];
  if(action==='review'){
   const job=await env.DB.prepare('SELECT status FROM jobs WHERE id=? AND campaign_id=?').bind(lane.job_id,cid).first();
   if(job?.status!=='ready_for_review')return error('Download and inspect a completed MP4 before confirming review',409);
   if(lane.status!=='queued'&&lane.status!=='ready'&&lane.status!=='rendering')return error('This clip was already reviewed or submitted',409);
   await env.DB.prepare("UPDATE distribution_targets SET status='reviewed',updated_at=? WHERE campaign_id=? AND platform=?").bind(now,cid,platform).run();
  }else if(action==='published'){
   if(lane.status!=='reviewed')return error('Review the platform-specific MP4 first',409);
   const published=publicUrl(String(data.published_url||''),platform),ms=Date.parse(String(data.published_at||''));
   if(!published)return error('A valid public '+platform+' post URL is required');
   if(!Number.isFinite(ms)||ms>Date.now()+300000||ms<Date.now()-30*86400000)return error('Provide the actual publishing timestamp from the last 30 days');
   await env.DB.prepare(`UPDATE distribution_targets SET status='published',published_url=?,published_at=?,updated_at=?
     WHERE campaign_id=? AND platform=?`).bind(published,new Date(ms).toISOString(),now,cid,platform).run();
  }else if(action==='submitted'){
   if(lane.status!=='published'||!lane.published_url||!lane.published_at)return error('Post from the approved account before submitting',409);
   const ref=String(data.submission_reference||'').trim().slice(0,300);
   const record=await env.DB.prepare(`INSERT OR IGNORE INTO campaign_submissions
    (id,campaign_id,job_id,platform,published_url,published_at,submitted_at,submission_reference,outcome,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING id`)
    .bind(crypto.randomUUID(),cid,lane.job_id,platform,lane.published_url,lane.published_at,now,ref,'pending',now).first();
   if(!record)return error('This clip/post was previously recorded as submitted',409);
   await env.DB.prepare(`UPDATE distribution_targets SET status='submitted',submitted_at=?,submission_reference=?,updated_at=?
    WHERE campaign_id=? AND platform=?`).bind(now,ref,now,cid,platform).run();
  }else if(action==='outcome'){
   if(!['submitted','accepted','rejected','paid'].includes(lane.status)||!['accepted','rejected','paid'].includes(data.outcome))
    return error('Confirm a real submitted clip and actual observed decision',409);
   const row=await env.DB.prepare(`UPDATE campaign_submissions SET outcome=?,updated_at=?
    WHERE job_id=? AND campaign_id=? RETURNING id`).bind(data.outcome,now,lane.job_id,cid).first();
   if(!row)return error('Recorded submission missing',409);
   await env.DB.prepare('UPDATE distribution_targets SET outcome=?,status=?,updated_at=? WHERE campaign_id=? AND platform=?')
    .bind(data.outcome,data.outcome,now,cid,platform).run();
  }else if(action==='history_outcome'){
   const sid=String(data.submission_id||'');
   if(!ID.test(sid)||!['accepted','rejected','paid'].includes(data.outcome))
    return error('Choose a real recorded submission and observed sponsor decision');
   const row=await env.DB.prepare(`UPDATE campaign_submissions SET outcome=?,updated_at=?
    WHERE id=? AND campaign_id=? AND platform=? RETURNING job_id`)
    .bind(data.outcome,now,sid,cid,platform).first();
   if(!row)return error('Submission not found under this platform',404);
   if(row.job_id===lane.job_id&&['submitted','accepted','rejected','paid'].includes(lane.status))
    await env.DB.prepare('UPDATE distribution_targets SET outcome=?,status=?,updated_at=? WHERE campaign_id=? AND platform=?')
     .bind(data.outcome,data.outcome,now,cid,platform).run();
  }else if(action==='retry_render'){
   if(lane.status!=='queued'||!lane.job_id)return error('Only failed, unpublished render jobs can be retried',409);
   const job=await env.DB.prepare('SELECT status FROM jobs WHERE id=? AND campaign_id=?').bind(lane.job_id,cid).first();
   if(job?.status!=='failed')return error('Wait for the current render to finish before retrying',409);
   await env.DB.prepare(`UPDATE distribution_targets SET job_id=NULL,status='configured',updated_at=?
     WHERE campaign_id=? AND platform=? AND status='queued'`).bind(now,cid,platform).run();
  }else if(action==='next'){
   if(!['submitted','accepted','rejected','paid'].includes(lane.status))return error('Record actual submission before starting a new clip',409);
   await env.DB.prepare(`UPDATE distribution_targets SET job_id=NULL,status='configured',published_url=NULL,published_at=NULL,
     submitted_at=NULL,submission_reference='',outcome='pending',updated_at=? WHERE campaign_id=? AND platform=?`)
    .bind(now,cid,platform).run();
  }else return error('Unsupported lane action');
  return send({ok:true,platform,action,lanes:await getTargets(env,cid),self_reported:true});
 }
 return error('Distribution endpoint not found',404);
}
