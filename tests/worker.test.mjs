import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../worker/index.js';
const CID='5ad699cd-7aed-44f7-9b57-489fdd6e2628';
function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');sql.exec(readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf-8'));
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
 const profile={campaign_id:CID,verified_eligibility:true,assets_licensed:true,rights_evidence:'approved test asset',brief_reviewed:true,allows_original_graphic:true,max_variants:2,product_name:'Demo brand',approved_value_prop:'Accurate test fact',approved_cta:'Visit official page',required_caption:'#ad'};
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
