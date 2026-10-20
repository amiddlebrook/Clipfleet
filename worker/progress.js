/** Per-campaign workflow tracker. All manual milestones are explicit operator attestations.
 * No platform login, payments, or Content Rewards submission is performed here.
 */
const ID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const PLATFORMS=new Set(['youtube','tiktok','instagram','facebook','x']);
const STAGES=['joined','social','brief','rights','profile','render','review','published','submitted','outcome'];
const headers={'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const fail=(message,status=400)=>reply({error:message},status);
const now=()=>new Date().toISOString();

function verifyPost(raw,platform){
 if(typeof raw!=='string'||raw.length>500)return null;
 let u;try{u=new URL(raw);}catch{return null;}
 if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 const host=u.hostname.toLowerCase().replace(/^www\./,'');
 const p=u.pathname;
 let valid=false;
 if(platform==='youtube')valid=(host==='youtube.com'&&(/^\/shorts\/[\w-]{6,}/.test(p)||p==='/watch'&&Boolean(u.searchParams.get('v'))))||(host==='youtu.be'&&/^\/[\w-]{6,}/.test(p));
 else if(platform==='tiktok')valid=host==='tiktok.com'&&/^\/@[^/]+\/video\/\d+/.test(p);
 else if(platform==='instagram')valid=host==='instagram.com'&&/^\/reel\/[\w-]+/.test(p);
 else if(platform==='facebook')valid=(host==='facebook.com'&&(/^\/reel\/\d+/.test(p)||/\/videos\/\d+/.test(p)||p==='/watch'&&Boolean(u.searchParams.get('v'))))||host==='fb.watch';
 else if(platform==='x')valid=host==='x.com'&&/^\/[^/]+\/status\/\d+/.test(p);
 if(!valid)return null;
 return u.href;
}
function cleanState(value){
 try{const d=JSON.parse(value||'{}');return d&&typeof d==='object'&&!Array.isArray(d)?d:{};}catch{return {};}
}
async function snapshot(env,id){
 const campaign=await env.DB.prepare('SELECT id,title,url,model,rate,budget_remaining,accepting,detail_checked_at FROM campaigns WHERE id=?').bind(id).first();
 if(!campaign)return null;
 const tracking=await env.DB.prepare('SELECT state,revision,updated_at FROM campaign_workflows WHERE campaign_id=?').bind(id).first();
 const trusted=await env.DB.prepare('SELECT campaign_id,enabled,reviewed_at FROM trusted_campaigns WHERE campaign_id=?').bind(id).first();
 const list=await env.DB.prepare('SELECT id,status,created_at,completed_at FROM jobs WHERE campaign_id=? ORDER BY created_at DESC LIMIT 35').bind(id).all();
 const jobs=list.results||[];
 const submissionsResult=await env.DB.prepare('SELECT id,job_id,platform,published_url,published_at,submitted_at,submission_reference,outcome,updated_at FROM campaign_submissions WHERE campaign_id=? ORDER BY submitted_at DESC LIMIT 50').bind(id).all();
 const submissions=submissionsResult.results||[];
 const state=cleanState(tracking?.state);
 const profile=Boolean(trusted&&trusted.enabled);
 const ready=jobs.some(j=>j.status==='ready_for_review'&&(j.id===state.reviewed_job_id||!submissions.some(v=>v.job_id===j.id)));
 const reviewed=Boolean(state.reviewed_job_id&&jobs.some(j=>j.id===state.reviewed_job_id&&j.status==='ready_for_review'));
 const completed={
  joined:Boolean(state.joined_at),social:Boolean(state.social_at),brief:Boolean(state.brief_at),
  rights:Boolean(state.rights_at),profile,render:ready,review:reviewed,
  published:Boolean(reviewed&&state.published_url&&state.published_at),
  submitted:Boolean(reviewed&&state.published_url&&state.submitted_at),
  outcome:Boolean(state.submitted_at&&state.outcome&&state.outcome!=='pending')
 };
 const first=STAGES.find(k=>!completed[k])||'complete';
 return {campaign,state,completed,steps:STAGES,completed_count:STAGES.filter(k=>completed[k]).length,
  next_step:first,revision:Number(tracking?.revision||0),updated_at:tracking?.updated_at||null,
  profile_authorized:profile,jobs,submissions,ready_jobs:jobs.filter(j=>j.status==='ready_for_review'&&!submissions.some(v=>v.job_id===j.id)),
  submission_window:state.published_at?{
   recorded_published_at:state.published_at,deadline:new Date(Date.parse(state.published_at)+30*60000).toISOString(),
   minutes_remaining:Math.max(0,Math.ceil((Date.parse(state.published_at)+30*60000-Date.now())/60000)),
   expired:Date.now()>Date.parse(state.published_at)+30*60000,
   note:'Based only on your reported publication time; the social platform and Content Rewards are not queried.'
  }:null,
  tracking_note:'Joined, rights, account connection, posting and submission are self-reported; no platform API verification.'};
}
async function persist(env,id,prev,newState,action,detail={}){
 const ts=now();
 const encoded=JSON.stringify(newState);
 if(encoded.length>9000)return fail('Workflow data exceeds 9 KB');
 if(prev.revision===0&&prev.updated_at===null){
  // An absent record may be created only once; concurrent submit attempts fail closed.
  const inserted=await env.DB.prepare('INSERT OR IGNORE INTO campaign_workflows(campaign_id,state,revision,updated_at) VALUES(?,?,1,?) RETURNING campaign_id')
    .bind(id,encoded,ts).first();
  if(!inserted)return fail('Workflow changed. Refresh and retry.',409);
 }else{
  const changed=await env.DB.prepare('UPDATE campaign_workflows SET state=?,revision=revision+1,updated_at=? WHERE campaign_id=? AND revision=? RETURNING revision')
    .bind(encoded,ts,id,prev.revision).first();
  if(!changed)return fail('Workflow changed. Refresh and retry.',409);
 }
 const safeDetail=JSON.stringify(detail).slice(0,1400);
 await env.DB.prepare('INSERT INTO campaign_workflow_events(id,campaign_id,action,detail,created_at) VALUES(?,?,?,?,?)')
  .bind(crypto.randomUUID(),id,action,safeDetail,ts).run();
 return reply({ok:true,workflow:await snapshot(env,id)});
}
export async function workflowRoute(req,env,path,url){
 if(path==='/api/workflows'&&req.method==='GET'){
  const rows=await env.DB.prepare(`SELECT w.campaign_id,c.title,w.state,w.updated_at FROM campaign_workflows w
   JOIN campaigns c ON c.id=w.campaign_id ORDER BY w.updated_at DESC LIMIT 60`).all();
  return reply({workflows:(rows.results||[]).map(row=>{
   const s=cleanState(row.state);
   return {campaign_id:row.campaign_id,title:row.title,updated_at:row.updated_at,
    posted:Boolean(s.published_url),submitted:Boolean(s.submitted_at),outcome:s.outcome||'pending'};
  })});
 }
 if(path==='/api/workflow'&&req.method==='GET'){
  const id=String(url.searchParams.get('campaign_id')||'').toLowerCase();
  if(!ID.test(id))return fail('Select a valid campaign');
  const item=await snapshot(env,id);
  return item?reply({workflow:item}):fail('Campaign not found',404);
 }
 if(path==='/api/workflow/events'&&req.method==='GET'){
  const id=String(url.searchParams.get('campaign_id')||'').toLowerCase();
  if(!ID.test(id))return fail('Select a valid campaign');
  const rows=await env.DB.prepare('SELECT action,detail,created_at FROM campaign_workflow_events WHERE campaign_id=? ORDER BY created_at DESC LIMIT 20').bind(id).all();
  return reply({events:rows.results});
 }
 if(path!=='/api/workflow' || req.method!=='POST')return null;
 let data;
 try{
  if(!/^application\/json/i.test(req.headers.get('content-type')||''))return fail('Expected JSON');
  const raw=await req.text();
  if(raw.length>6500)return fail('Request too large',413);
  data=JSON.parse(raw);
  if(!data||typeof data!=='object'||Array.isArray(data))return fail('Expected JSON object');
 }catch{return fail('Invalid JSON');}
 const id=String(data.campaign_id||'').toLowerCase(),action=String(data.action||'');
 if(!ID.test(id))return fail('Select an indexed campaign');
 const previous=await snapshot(env,id);
 if(!previous)return fail('Campaign not found',404);
 const state={...previous.state},done=previous.completed;
 if(data.confirm!==true)return fail('Explicit operator confirmation is required');
 const ts=now();
 switch(action){
  case 'joined':
   state.joined_at=ts;break;
  case 'social':{
   if(!done.joined)return fail('Join the campaign before confirming the connected account',409);
   const presetId=String(data.social_preset_id||'');
   if(!ID.test(presetId)||data.platform_allowed_by_campaign!==true)return fail('Select a connected social preset and confirm the brief permits this platform');
   const preset=await env.DB.prepare('SELECT id,platform,handle,confirmed_connected FROM social_presets WHERE id=?').bind(presetId).first();
   if(!preset||!preset.confirmed_connected||!PLATFORMS.has(preset.platform))return fail('Save and confirm a social account preset first');
   state.social_at=ts;state.social_preset_id=preset.id;state.platform=preset.platform;state.handle=preset.handle;
   break;
  }
  case 'brief':
   if(!done.social)return fail('Confirm a connected and permitted social account first',409);
   state.brief_at=ts;break;
  case 'rights':{
   if(!done.brief)return fail('Review the full campaign brief first',409);
   const evidence=String(data.rights_evidence||'').trim();
   if(evidence.length<12||evidence.length>500)return fail('Provide a specific rights reference between 12 and 500 characters');
   state.rights_at=ts;state.rights_evidence=evidence;break;
  }
  case 'review':{
   if(!done.rights||!done.profile)return fail('Authorize a compliant campaign profile before reviewing renders',409);
   const jobId=String(data.job_id||'');
   if(!ID.test(jobId)||!previous.ready_jobs.some(j=>j.id===jobId))return fail('Select an unused, completed render from this campaign');
   state.reviewed_job_id=jobId;state.reviewed_at=ts;
   delete state.published_url;delete state.published_at;delete state.submitted_at;delete state.outcome;
   break;
  }
  case 'published':{
   if(!done.review)return fail('Review a completed rendered video before recording publication',409);
   const url=verifyPost(String(data.published_url||''),state.platform);
   if(!url)return fail('Enter a valid public post URL on the connected, selected social platform');
   const pub=String(data.published_at||'');
   const ms=Date.parse(pub);
   if(!Number.isFinite(ms)||ms>Date.now()+5*60000||ms<Date.now()-30*86400_000)return fail('Enter your actual publication time (within the last 30 days)');
   state.published_url=url;state.published_at=new Date(ms).toISOString();
   delete state.submitted_at;delete state.outcome;
   break;
  }
  case 'submitted':{
   if(!done.published)return fail('Record the published post URL before submission',409);
   const ref=String(data.submission_reference||'').trim().slice(0,300);
   const subId=crypto.randomUUID();
   try{
    const inserted=await env.DB.prepare('INSERT OR IGNORE INTO campaign_submissions(id,campaign_id,job_id,platform,published_url,published_at,submitted_at,submission_reference,outcome,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING id')
     .bind(subId,id,state.reviewed_job_id,state.platform,state.published_url,state.published_at,ts,ref,'pending',ts).first();
    if(!inserted)return fail('This job or post URL was previously submitted; use the recorded submission instead',409);
   }catch(e){if(e instanceof Response)return e;throw e;}
   state.submitted_at=ts;state.submission_reference=ref;state.submission_id=subId;
   delete state.outcome;break;
  }
  case 'outcome':{
   if(!done.submitted)return fail('First confirm actual submission to Content Rewards',409);
   if(!['accepted','rejected','paid'].includes(data.outcome))return fail('Select accepted, rejected or paid');
   const row=await env.DB.prepare('UPDATE campaign_submissions SET outcome=?,updated_at=? WHERE id=? AND campaign_id=? RETURNING id')
     .bind(data.outcome,ts,state.submission_id,id).first();
   if(!row)return fail('Submission record missing',409);
   state.outcome=data.outcome;state.outcome_at=ts;
   break;
  }
  case 'next_clip':{
   if(!done.submitted)return fail('Record the completed submission before starting the next clip',409);
   for(const key of ['reviewed_job_id','reviewed_at','published_url','published_at','submitted_at','submission_reference','submission_id','outcome','outcome_at'])delete state[key];
   break;
  }
  case 'submission_outcome':{
   const sid=String(data.submission_id||'');
   if(!ID.test(sid)||!['accepted','rejected','paid'].includes(data.outcome))return fail('Choose an actual submission and verified-by-you outcome');
   const row=await env.DB.prepare('UPDATE campaign_submissions SET outcome=?,updated_at=? WHERE id=? AND campaign_id=? RETURNING id')
    .bind(data.outcome,ts,sid,id).first();
   if(!row)return fail('Submission not found',404);
   if(state.submission_id===sid){state.outcome=data.outcome;state.outcome_at=ts;}
   break;
  }
  default:return fail('Unsupported workflow action');
 }
 return persist(env,id,previous,state,action,{platform:state.platform||'',job_id:state.reviewed_job_id||'',outcome:state.outcome||''});
}
