import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../worker/index.js';
const CID='5ad699cd-7aed-44f7-9b57-489fdd6e2628';
function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');sql.exec(readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf-8'));sql.exec(readFileSync(new URL('../migrations/0002_social_presets_ai.sql',import.meta.url),'utf-8'));sql.exec(readFileSync(new URL('../migrations/0003_guided_workflows.sql',import.meta.url),'utf-8'));sql.exec(readFileSync(new URL('../migrations/0004_submission_ledger.sql',import.meta.url),'utf-8'));
 const DB={prepare:(q)=>({bind(...args){this.args=args;return this},async first(){return sql.prepare(q).get(...(this.args||[]))||null},async run(){return {meta:{changes:sql.prepare(q).run(...(this.args||[])).changes}}},async all(){return {results:sql.prepare(q).all(...(this.args||[]))}}})};
 return {sql,env:{DB,ADMIN_TOKEN:'abcdef0123456789abcdef0123456789'}};
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
 const finished=await call(env,`/api/jobs/${id}/complete`,'POST',{status:'ready_for_review',output_sha256:'a'.repeat(64)});
 assert.equal(finished.code,200);
 assert.equal((await call(env,`/api/jobs/${id}/complete`,'POST',{status:'ready_for_review'})).code,409);
 const jobs=(await call(env,'/api/jobs')).json.jobs;
 assert.equal(jobs.length,2);
 assert.equal(jobs.filter(x=>x.status==='ready_for_review').length,1);
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
