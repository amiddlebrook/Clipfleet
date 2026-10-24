import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../worker/index.js';
const CID='5ad699cd-7aed-44f7-9b57-489fdd6e2628';
function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');sql.exec(readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf-8'));sql.exec(readFileSync(new URL('../migrations/0002_social_presets_ai.sql',import.meta.url),'utf-8'));sql.exec(readFileSync(new URL('../migrations/0003_guided_workflows.sql',import.meta.url),'utf-8'));sql.exec(readFileSync(new URL('../migrations/0004_submission_ledger.sql',import.meta.url),'utf-8'));sql.exec(readFileSync(new URL('../migrations/0005_render_run_links.sql',import.meta.url),'utf-8'));sql.exec(readFileSync(new URL('../migrations/0006_grokbot_handoff.sql',import.meta.url),'utf-8'));sql.exec(readFileSync(new URL('../migrations/0007_platform_distribution.sql',import.meta.url),'utf-8'));sql.exec(readFileSync(new URL('../migrations/0008_onboarding_hub.sql',import.meta.url),'utf-8'));sql.exec(readFileSync(new URL('../migrations/0009_openrouter_setup.sql',import.meta.url),'utf-8'));
 const DB={prepare:(q)=>({bind(...args){this.args=args;return this},async first(){return sql.prepare(q).get(...(this.args||[]))||null},async run(){return {meta:{changes:sql.prepare(q).run(...(this.args||[])).changes}}},async all(){return {results:sql.prepare(q).all(...(this.args||[]))}}})};
 return {sql,env:{DB,ADMIN_TOKEN:'abcdef0123456789abcdef0123456789',GROKBOT_CALLBACK_TOKEN:'botcallbackabcdef0123456789abcdef0123456789'}};
}
function req(path,method='GET',data,token=true){return new Request('https://clipfleet.workers.dev'+path,{method,headers:{...(token?{Authorization:'Bearer abcdef0123456789abcdef0123456789'}:{}),...(data?{'content-type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});}
async function call(env,path,method='GET',data,token=true){const res=await worker.fetch(req(path,method,data,token),env);return {code:res.status,json:await res.json()};}
test('worker: authentication and full approved render queue lifecycle',async()=>{
 const {env,sql}=setup();
 assert.equal((await call(env,'/api/health','GET',undefined,false)).code,200);
 assert.equal((await call(env,'/api/campaigns','GET',undefined,false)).code,200);
 assert.equal((await call(env,'/api/stats','GET',undefined,false)).code,200);
 assert.equal((await call(env,'/api/jobs','GET',undefined,false)).code,401);
 const imported=await call(env,'/api/import','POST',{campaigns:[{id:CID,title:'Test campaign',model:'per_post',rate:10,budget_remaining:1000,accepting:true}]});
 assert.deepEqual(imported.json,{imported:1});
 const denied=await call(env,'/api/profiles','POST',{campaign_id:CID,verified_eligibility:true});assert.equal(denied.code,400);
 const profile={campaign_id:CID,verified_eligibility:true,assets_licensed:true,rights_evidence:'approved test asset',brief_reviewed:true,allows_original_graphic:true,max_variants:2,product_name:'Demo brand',approved_value_prop:'Accurate test fact',approved_cta:'Visit official page',required_caption:'#ad',allowed_platforms:['youtube']};
 assert.equal((await call(env,'/api/profiles','POST',profile)).code,201);
 assert.equal((await call(env,'/api/plan','POST',{})).json.planned,2);
 assert.equal((await call(env,'/api/plan','POST',{})).json.planned,0);
 const claim=await call(env,'/api/jobs/claim','POST',{worker:'github-actions'});
 assert.equal(claim.json.job.status,'rendering');
 const id=claim.json.job.id;
 const runLink='https://github.com/amiddlebrook/Clipfleet/actions/runs/39502067064';
 const finished=await call(env,`/api/jobs/${id}/complete`,'POST',{status:'ready_for_review',output_sha256:'a'.repeat(64),actions_run_url:runLink});
 assert.equal(finished.code,200);
 assert.equal((await call(env,`/api/jobs/${id}/complete`,'POST',{status:'ready_for_review'})).code,409);
 const jobs=(await call(env,'/api/jobs')).json.jobs;
 assert.equal(jobs.length,2);
 assert.equal(jobs.filter(x=>x.status==='ready_for_review').length,1);
 assert.equal(jobs.find(x=>x.id===id).actions_run_url,runLink);
 sql.close();
});

test('social presets store only handles and never imply OAuth verification',async()=>{
 const {env,sql}=setup();
 let r=await call(env,'/api/social-presets','POST',{platform:'instagram',handle:'myclipaccount',confirmed_connected:false});
 assert.equal(r.code,400);
 r=await call(env,'/api/social-presets','POST',{platform:'instagram',handle:'myclipaccount',confirmed_connected:true});
 assert.equal(r.code,201);
 assert.equal(r.json.profile_url,'https://www.instagram.com/myclipaccount/');
 assert.equal(r.json.verification,'user_attested_not_oauth');
 const id=r.json.id;
 assert.equal((await call(env,'/api/social-presets')).json.presets.length,1);
 assert.equal((await call(env,'/api/social-presets','GET',undefined,false)).code,401);
 const cid='5ad699cd-7aed-44f7-9b57-489fdd6e2628';
 await call(env,'/api/import','POST',{campaigns:[{id:cid,accepting:true,budget_remaining:100}]});
 const base={campaign_id:cid,verified_eligibility:true,assets_licensed:true,brief_reviewed:true,
  rights_evidence:'owner approved original',allows_original_graphic:true,allowed_platforms:['youtube'],
  social_preset_id:id,platform_allowed_by_campaign:true};
 assert.equal((await call(env,'/api/profiles','POST',base)).code,400,'mismatched platform rejected');
 assert.equal((await call(env,'/api/profiles','POST',{...base,allowed_platforms:['instagram']})).code,201);
 assert.equal((await call(env,'/api/social-presets/'+id,'DELETE')).code,200);
 assert.equal((await call(env,'/api/social-presets')).json.presets.length,0);
 sql.close();
});
test('AI drafting requires supplied brief, never writes rights or eligibility',async()=>{
 const {env,sql}=setup();
 await call(env,'/api/import','POST',{campaigns:[{id:CID,title:'Sample',accepting:true,budget_remaining:100}]});
 env.AI={async run(model,params){
  assert.match(model,/llama-3.1-8b/);
  assert.match(params.messages[1].content,/official claim/);
  return {response:JSON.stringify({product_name:'Sample',approved_value_prop:'official claim',
    approved_cta:'Visit official link',required_caption:'#ad'})};
 }};
 const bad=await call(env,'/api/assist','POST',{campaign_id:CID,brief_text:'short'});
 assert.equal(bad.code,400);
 const brief='Campaign guidelines: The official claim is available in the official brief. CTA: Visit official link. Required caption: #ad.';
 const success=await call(env,'/api/assist','POST',{campaign_id:CID,brief_text:brief});
 assert.equal(success.code,200);
 assert.equal(success.json.fields.approved_value_prop,'official claim');
 assert.equal(success.json.review_required,true);
 assert.equal(success.json.fields.assets_licensed,undefined);
 sql.close();
});

test('workflow is ordered; duplicate submissions are not silently reused; earlier clips persist',async()=>{
 const {env,sql}=setup();
 const j=(action,extra={})=>call(env,'/api/workflow','POST',{campaign_id:CID,action,confirm:true,...extra});
 const state=async()=>(await call(env,'/api/workflow?campaign_id='+CID)).json.workflow;
 await call(env,'/api/import','POST',{campaigns:[{id:CID,title:'Official example',model:'per_post',rate:10,budget_remaining:100,accepting:true}]});
 const before=await state();
 assert.equal(before.next_step,'joined');assert.equal(before.completed_count,0);
 assert.equal((await j('social',{social_preset_id:crypto.randomUUID(),platform_allowed_by_campaign:true})).code,409);
 assert.equal((await j('joined')).code,200);
 const p=(await call(env,'/api/social-presets','POST',{platform:'youtube',handle:'safecliptest',confirmed_connected:true})).json;
 assert.equal((await j('social',{social_preset_id:p.id,platform_allowed_by_campaign:true})).code,200);
 assert.equal((await j('rights',{rights_evidence:'Sponsor-provided terms'})).code,409);
 assert.equal((await j('brief')).code,200);
 assert.equal((await j('rights',{rights_evidence:'Official sponsor creative permission in approved brief'})).code,200);
 assert.equal((await state()).next_step,'profile');
 const profile={campaign_id:CID,verified_eligibility:true,assets_licensed:true,
 rights_evidence:'Official sponsor creative permission in approved brief',brief_reviewed:true,allows_original_graphic:true,
 allowed_platforms:['youtube'],social_preset_id:p.id,platform_allowed_by_campaign:true,max_variants:2,
 product_name:'Test brand',approved_value_prop:'Official fact',approved_cta:'Visit brand',required_caption:'#ad'};
 assert.equal((await call(env,'/api/profiles','POST',profile)).code,201);
 assert.equal((await state()).next_step,'render');
 assert.equal((await call(env,'/api/plan','POST',{})).json.planned,2);
 const render=await call(env,'/api/jobs/claim','POST',{worker:'github-actions'});
 const first=render.json.job.id;
 assert.equal((await call(env,'/api/jobs/'+first+'/complete','POST',{status:'ready_for_review',output_sha256:'a'.repeat(64)})).code,200);
 assert.equal((await state()).next_step,'review');
 assert.equal((await j('published',{published_url:'https://www.youtube.com/shorts/Abcdefghijk',published_at:new Date().toISOString()})).code,409);
 assert.equal((await j('review',{job_id:first})).code,200);
 const url='https://www.youtube.com/shorts/Abcdefghijk';
 assert.equal((await j('published',{published_url:'https://example.com/misleading',published_at:new Date().toISOString()})).code,400);
 assert.equal((await j('published',{published_url:url,published_at:new Date().toISOString()})).code,200);
 assert.equal((await state()).next_step,'submitted');
 assert.equal((await j('submitted',{submission_reference:'Manual receipt 123'})).code,200);
 let snap=await state();
 assert.equal(snap.submissions.length,1);
 assert.equal(snap.submissions[0].outcome,'pending');
 assert.equal((await j('next_clip')).code,200);
 snap=await state();
 assert.equal(snap.submissions.length,1);
 assert.equal(snap.next_step,'render','the only ready job is already in the ledger');
 assert.equal((await j('review',{job_id:first})).code,409);
 assert.equal((await j('submission_outcome',{submission_id:snap.submissions[0].id,outcome:'paid'})).code,200);
 const second=(await call(env,'/api/jobs/claim','POST',{worker:'github-actions'})).json.job.id;
 await call(env,'/api/jobs/'+second+'/complete','POST',{status:'ready_for_review'});
 assert.equal((await state()).next_step,'review');
 assert.equal((await j('review',{job_id:second})).code,200);
 assert.equal((await j('published',{published_url:'https://www.youtube.com/shorts/Hijklmno123',published_at:new Date().toISOString()})).code,200);
 assert.equal((await j('submitted')).code,200);
 snap=await state();
 assert.equal(snap.submissions.length,2);
 assert.equal(snap.submissions[1].outcome,'paid');
 assert.equal((await call(env,'/api/workflow?campaign_id='+CID,'GET',undefined,false)).code,401);
 assert.ok((await call(env,'/api/workflow/events?campaign_id='+CID)).json.events.length>=10);
 sql.close();
});
test('guided dashboard includes navigation, safety links and no automatic submission',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf-8');
 const js=readFileSync(new URL('../public/journey.js',import.meta.url),'utf-8');
 for(const id of ['journey-picker','journey-steps','journey-events','journey-submissions'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/submitGuide/);assert.match(js,/published_at/);
 assert.match(js,/I actually submitted the post URL/);
});

test('Grok Bot queue only includes approved rendered clips and webhook status is not completion',async()=>{
 const {env,sql}=setup();
 await call(env,'/api/import','POST',{campaigns:[{id:CID,title:'Campaign',model:'per_post',rate:15,accepting:true,budget_remaining:400}]});
 let result=await call(env,'/api/grokbot/queue','POST',{job_id:crypto.randomUUID()});
 assert.equal(result.code,409,'unknown jobs cannot be handed off');
 const profile={campaign_id:CID,verified_eligibility:true,assets_licensed:true,brief_reviewed:true,
  rights_evidence:'campaign approval rights',allows_original_graphic:true,allowed_platforms:['youtube'],
  max_variants:1,product_name:'Test',approved_value_prop:'Approved',approved_cta:'Visit',required_caption:'#ad'};
 assert.equal((await call(env,'/api/profiles','POST',profile)).code,201);
 assert.equal((await call(env,'/api/plan','POST',{})).json.planned,1);
 const job=(await call(env,'/api/jobs/claim','POST',{worker:'github-actions'})).json.job;
 result=await call(env,'/api/grokbot/queue','POST',{job_id:job.id});
 assert.equal(result.code,409,'rendering jobs cannot be sent');
 const runLink='https://github.com/amiddlebrook/Clipfleet/actions/runs/39512428322';
 result=await call(env,`/api/jobs/${job.id}/complete`,'POST',
    {status:'ready_for_review',output_sha256:'a'.repeat(64),actions_run_url:runLink});
 assert.equal(result.code,200);
 result=await call(env,'/api/grokbot/tasks');
 assert.equal(result.json.tasks.length,1,'ready job should be auto-queued');
 assert.equal(result.json.tasks[0].status,'queued');
 assert.equal((await call(env,'/api/grokbot/queue','POST',{job_id:job.id})).json.queued,false,'no duplicate task');
 const claimed=(await call(env,'/api/grokbot/claim','POST',{max:2})).json.tasks;
 assert.equal(claimed.length,1);
 assert.equal(claimed[0].job_id,job.id);
 const accepted=await call(env,'/api/grokbot/dispatch-result','POST',{task_id:claimed[0].id,http_status:200});
 assert.equal(accepted.code,200);
 assert.equal(accepted.json.accepted,true);
 assert.equal(accepted.json.bot_finished,false);
 const report=(data,auth='botcallbackabcdef0123456789abcdef0123456789')=>
 worker.fetch(new Request('https://clipfleet.workers.dev/api/grokbot/report',{method:'POST',
  headers:{'content-type':'application/json',Authorization:'Bearer '+auth},body:JSON.stringify(data)}),env);
 assert.equal((await report({task_id:claimed[0].id,action:'prepared'},'incorrect-token')).status,401);
 assert.equal((await report({task_id:claimed[0].id,action:'paid'})).status,400,'cannot claim payout');
 assert.equal((await report({task_id:claimed[0].id,action:'needs_approval',note:'Review prepared draft'})).status,200);
 assert.equal((await report({task_id:claimed[0].id,action:'needs_approval'})).status,409,'only one completion report allowed');
 const tasks=(await call(env,'/api/grokbot/tasks')).json.tasks;
 assert.equal(tasks[0].status,'reported');
 assert.equal(tasks[0].reported_action,'needs_approval');
 const workflow=(await call(env,'/api/workflow?campaign_id='+CID)).json.workflow;
 assert.equal(workflow.completed.published,false,'bot reports never automatically mark social publication');
 assert.equal(workflow.completed.submitted,false,'bot reports never automatically mark Content Rewards submissions');
 sql.close();
});

test('Grok Bot links and scripts are included in the dashboard',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf-8');
 const js=readFileSync(new URL('../public/grokbot.js',import.meta.url),'utf-8');
 assert.match(html,/id="grokbot"/);
 assert.match(html,/src="\/grokbot.js"/);
 assert.match(js,/callback_configured/);
 assert.match(js,/Accepted = webhook run started/);
});

test('four separate publishing lanes render distinct videos, route to exact accounts, and preserve submission histories',async()=>{
 const {env,sql}=setup();
 const post=(route,body)=>call(env,route,'POST',body);
 await post('/api/import',{campaigns:[{id:CID,title:'Multi-channel brand',model:'per_post',rate:15,
  budget_remaining:1000,accepting:true}]});
 const all=['youtube','tiktok','instagram','x'];
 const handles=['samplechannel','sampletiktok','samplereels','sampletweets'];
 const saved=[];
 for(let i=0;i<4;i++){
  const p=await post('/api/social-presets',{platform:all[i],handle:handles[i],confirmed_connected:true});
  assert.equal(p.code,201);saved.push(p.json);
 }
 const workflow=async(action,rest={})=>post('/api/workflow',{campaign_id:CID,action,confirm:true,...rest});
 assert.equal((await workflow('joined')).code,200);
 assert.equal((await workflow('social',{social_preset_id:saved[0].id,platform_allowed_by_campaign:true})).code,200);
 assert.equal((await workflow('brief')).code,200);
 assert.equal((await workflow('rights',{rights_evidence:'Brand approves original graphics for every target platform'})).code,200);
 const prof={campaign_id:CID,verified_eligibility:true,assets_licensed:true,brief_reviewed:true,
  rights_evidence:'Brand approved creative for these platforms',allows_original_graphic:true,
  allowed_platforms:['youtube'],product_name:'Legitimate brand',approved_value_prop:'Approved statement',
  approved_cta:'Learn more',required_caption:'#ad',max_variants:1};
 assert.equal((await post('/api/profiles',prof)).code,201);
 const configuration=await post('/api/distribution/setup',{
  campaign_id:CID,confirm:true,
  lanes:all.map((platform,i)=>({platform,preset_id:saved[i].id,campaign_permits_platform:true}))
 });
 assert.equal(configuration.code,201,JSON.stringify(configuration.json));
 const initial=await call(env,'/api/distribution?campaign_id='+CID);
 assert.equal(initial.json.lanes.length,4);
 assert.equal((await post('/api/plan',{})).json.platform_planned,4);
 assert.equal((await post('/api/distribution/plan',{confirm:true})).json.planned,0,'no duplicate renders');
 const jobs=[];
 for(let i=0;i<4;i++){
  const claimed=await post('/api/jobs/claim',{worker:'github-actions'});
  assert.equal(claimed.code,200);const job=claimed.json.job;
  assert.ok(job);
  const payload=JSON.parse(job.payload);
  assert.equal(payload.target_platform,all[i]);
  assert.equal(payload.variant,i);
  assert.deepEqual(payload.allowed_platforms,[all[i]]);
  assert.equal(payload.posting_account_handle,handles[i]);
  jobs.push(job.id);
  const done=await post('/api/jobs/'+job.id+'/complete',{
    status:'ready_for_review',actions_run_url:'https://github.com/amiddlebrook/Clipfleet/actions/runs/39831992156',
    output_sha256:String(i).repeat(64)
  });assert.equal(done.code,200);
 }
 const check=await call(env,'/api/distribution?campaign_id='+CID);
 assert.equal(check.json.lanes.length,4);
 assert.ok(check.json.lanes.every(x=>x.render_status==='ready_for_review'));
 const report=(platform,action,extra={})=>post('/api/distribution/progress',{
   campaign_id:CID,platform,action,confirm:true,...extra});
 const posts={
  youtube:'https://www.youtube.com/shorts/Abcdefghi99',
  tiktok:'https://www.tiktok.com/@sampletiktok/video/123456789011222',
  instagram:'https://www.instagram.com/reel/AbcD1234567/',
  x:'https://x.com/sampletweets/status/123456789011222'
 };
 const date=new Date().toISOString();
 assert.equal((await report('x','published',{published_url:posts.x,published_at:date})).code,409,'skip-review blocked');
 for(const platform of all){
  assert.equal((await report(platform,'review')).code,200);
  assert.equal((await report(platform,'published',{published_url:posts.youtube,published_at:date})).code,
    platform==='youtube'?200:400,'mismatched platform URL rejected');
  if(platform!=='youtube')assert.equal((await report(platform,'published',{published_url:posts[platform],published_at:date})).code,200);
 }
 assert.equal((await report('youtube','submitted',{submission_reference:'first real receipt'})).code,200);
 assert.equal((await report('youtube','submitted',{})).code,409,'cannot submit same platform post twice');
 let snap=await call(env,'/api/distribution?campaign_id='+CID);
 assert.equal(snap.json.submissions.length,1);
 assert.equal(snap.json.lanes.find(x=>x.platform==='tiktok').status,'published');
 assert.equal((await report('youtube','outcome',{outcome:'paid'})).code,200);
 assert.equal((await report('youtube','next')).code,200);
 snap=await call(env,'/api/distribution?campaign_id='+CID);
 assert.equal(snap.json.lanes.find(x=>x.platform==='youtube').job_id,null);
 assert.equal(snap.json.submissions.length,1,'old submission is retained');
 assert.equal(snap.json.submissions[0].outcome,'paid');
 assert.equal((await report('youtube','history_outcome',
  {submission_id:snap.json.submissions[0].id,outcome:'paid'})).code,200,
  'previous platform submission remains independently editable after resetting lane');
 assert.equal((await report('tiktok','history_outcome',
  {submission_id:snap.json.submissions[0].id,outcome:'paid'})).code,404,
  'one platform cannot alter another platform submission');
 assert.equal((await call(env,'/api/distribution?campaign_id='+CID,'GET',undefined,false)).code,401);
 sql.close();
});
test('four-platform dashboard loads safe form widgets and input checks',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf-8');
 const script=readFileSync(new URL('../public/distribution.js',import.meta.url),'utf-8');
 assert.match(html,/id="distribution"/);
 assert.match(html,/src="\/distribution.js"/);
 for(const platform of ['youtube','tiktok','instagram','x'])assert.match(script,new RegExp("id:'"+platform+"'"));
 assert.match(script,/Submit within ~/);
});

test('Connect Everything hub persists admin-only confirmations and requires social account presets',async()=>{
 const {env,sql}=setup();
 const list=await call(env,'/api/onboarding');
 assert.equal(list.code,200);
 assert.equal(Object.keys(list.json.steps).length,0);
 assert.equal(list.json.platform_note.includes('your own confirmations'),true);
 assert.equal((await call(env,'/api/onboarding','GET',undefined,false)).code,401);
 const confirm=(step_id,completed,auth=true)=>call(env,'/api/onboarding','POST',{step_id,completed,confirm:true},auth);
 assert.equal((await confirm('contentrewards',true)).code,200);
 const v=await call(env,'/api/onboarding');
 assert.equal(v.json.steps.contentrewards.completed,true);
 assert.equal(v.json.steps.contentrewards.verification,'self_reported');
 assert.equal((await confirm('youtube',true)).code,409,'social connection must have a saved preset');
 assert.equal((await confirm('openrouter',true)).code,200,'OpenRouter is a self-reported local key setup');
 assert.equal((await confirm('local_browser',true)).code,200,'Local browser installation is self-reported');
 const preset=await call(env,'/api/social-presets','POST',{platform:'youtube',handle:'clipchannel',confirmed_connected:true});
 assert.equal(preset.code,201);
 assert.equal((await confirm('youtube',true)).code,200);
 assert.equal((await call(env,'/api/onboarding')).json.social_presets.youtube,1);
 assert.equal((await confirm('youtube',false)).code,200);
 assert.equal((await call(env,'/api/onboarding')).json.steps.youtube.completed,false);
 assert.equal((await confirm('not_valid',true)).code,400);
 assert.equal((await confirm('whop',true,false)).code,401);
 sql.close();
});
test('Connect Everything renders actionable first-party links, no fake OAuth callback',()=>{
 const markup=readFileSync(new URL('../public/index.html',import.meta.url),'utf-8');
 const app=readFileSync(new URL('../public/connections.js',import.meta.url),'utf-8');
 assert.match(markup,/id="connections"/);assert.match(markup,/src="\/connections.js"/);
 for(const platform of ['youtube','tiktok','instagram','x'])assert.match(app,new RegExp("key:'"+platform+"'"));
 assert.match(app,/\/api\/onboarding/);
 assert.match(app,/self-confirmed, not independently OAuth-verified/);
 assert.match(app,/contentrewards.com\/c\/discover/);
 assert.match(app,/setup-openrouter-agent\.ps1/);
});
