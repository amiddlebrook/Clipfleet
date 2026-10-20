(()=>{
'use strict';
let token='';
let campaigns=[];
let jobs=[];
let presets=[];
let selectedCampaign=null;
const $=id=>document.getElementById(id);
const form=$('approve');
const api=async(method,path,payload)=>{
 const headers={};if(token)headers.Authorization='Bearer '+token;
 if(payload!==undefined)headers['Content-Type']='application/json';
 const res=await fetch(path,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload),cache:'no-store'});
 const data=await res.json();
 if(!res.ok)throw new Error(data.error||'Request failed');
 return data;
};
const element=(tag,value,parent)=>{
 const e=document.createElement(tag);
 if(value!==undefined)e.textContent=String(value);
 if(parent)parent.append(e);
 return e;
};
const dollars=n=>typeof n==='number'&&Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n):'—';
const fresher=c=>Boolean(c.detail_checked_at&&Date.now()-Date.parse(c.detail_checked_at)<12*3600*1000);
const isOpen=c=>Boolean(c.accepting&&Number.isFinite(Number(c.budget_remaining))&&Number(c.budget_remaining)>=20);
function setMessage(message){$('connection').textContent=message;}
function chooseCampaign(c){
 selectedCampaign=c;
 form.elements.namedItem('campaign_id').value=c.id;
 $('campaign-brief').value='';
 $('draft-status').textContent='Campaign selected: '+(c.title||c.id)+'. Paste the official brief to use AI drafting.';
 window.ClipFleetJourney?.select(c);
 document.getElementById('journey')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function currentFilters(){
 return {
  search:$('filter-search').value.trim().toLowerCase(),
  model:$('filter-model').value,
  status:$('filter-status').value,
  budget:Number($('filter-budget').value)||0,
  rate:Number($('filter-rate').value)||0,
  sort:$('filter-sort').value
 };
}
function visibleCampaigns(){
 const f=currentFilters();
 const filtered=campaigns.filter(c=>{
  if(f.search&&!((c.title||'')+' '+(c.id||'')).toLowerCase().includes(f.search))return false;
  if(f.model!=='all'&&c.model!==f.model)return false;
  if(f.status==='open'&&!isOpen(c))return false;
  if(f.status==='fresh'&&!fresher(c))return false;
  if(f.budget>0&&(!Number.isFinite(Number(c.budget_remaining))||Number(c.budget_remaining)<f.budget))return false;
  if(f.rate>0&&(c.rate===null||c.rate===undefined||!Number.isFinite(Number(c.rate))||Number(c.rate)<f.rate))return false;
  return true;
 });
 const num=(x,k)=>Number.isFinite(Number(x[k]))?Number(x[k]):-1;
 filtered.sort((a,b)=>{
  if(f.sort==='budget')return num(b,'budget_remaining')-num(a,'budget_remaining');
  if(f.sort==='recent')return Date.parse(b.detail_checked_at||'1970-01-01')-Date.parse(a.detail_checked_at||'1970-01-01');
  if(f.sort==='rate'){
    // Different models have different units. Group them rather than imply CPM and per-post are comparable.
    const am=['per_post','cpm','unknown'].indexOf(a.model),bm=['per_post','cpm','unknown'].indexOf(b.model);
    return am-bm||num(b,'rate')-num(a,'rate');
  }
  return num(b,'priority_score')-num(a,'priority_score')||num(b,'budget_remaining')-num(a,'budget_remaining');
 });
 return filtered;
}
function drawCampaigns(){
 const rows=visibleCampaigns(),tbody=$('campaigns');tbody.replaceChildren();
 $('filter-results').textContent=rows.length+' of '+campaigns.length+' campaigns';
 for(const c of rows){
  const tr=element('tr',undefined,tbody);
  const td=element('td',undefined,tr),a=element('a',c.title||c.id,td);
  a.href=c.url;a.target='_blank';a.rel='noopener noreferrer';element('small',c.id,td);
  element('td',c.model==='per_post'?'Per approved post':c.model==='cpm'?'Per 1K views':'Unverified',tr);
  element('td',dollars(c.rate),tr);
  element('td',dollars(c.budget_remaining),tr);
  const x=element('td',undefined,tr),badge=element('span',c.accepting?'Accepting*':'Unverified',x);
  badge.className='badge'+(c.accepting?'':' off');badge.title='Public snapshot; verify status and budget on the official campaign page';
  const sel=element('button','Select',element('td',undefined,tr));sel.type='button';sel.addEventListener('click',()=>chooseCampaign(c));
 }
 if(!rows.length){const tr=element('tr',undefined,tbody);const td=element('td','No results. Adjust filters or rescan public campaigns.',tr);td.colSpan=6;}
}
function drawJobs(){
 const list=$('jobs');list.replaceChildren();
 if(!jobs.length)element('p','No jobs queued yet. Authorize a reviewed campaign, then plan jobs.',list);
 for(const j of jobs.slice(0,30)){
  const d=element('div',undefined,list);d.className='job';
  element('strong',String(j.status||'unknown').replaceAll('_',' ').toUpperCase()+' — '+j.campaign_id,d);
  element('span','Job '+j.id.slice(0,8)+' · '+j.created_at+(j.error?' · '+j.error:''),d);
 }
}
function drawPresets(){
 const list=$('social-presets'),pick=$('campaign-social'),previous=pick.value;
 list.replaceChildren();pick.replaceChildren();
 const empty=element('option','Choose a saved account (optional)',pick);empty.value='';
 for(const p of presets){
  const opt=element('option',p.platform+' · @'+p.handle,pick);opt.value=p.id;
  const item=element('div',undefined,list);item.className='preset';
  const text=element('div',undefined,item);
  element('strong',p.platform.toUpperCase()+' · @'+p.handle,text);
  const a=element('a','View public profile ↗',text);a.href=p.profile_url;a.target='_blank';a.rel='noopener noreferrer';
  element('small','Connected: confirmed by you, not verified by ClipFleet',text);
  const use=element('button','Use preset',item);use.type='button';
  use.addEventListener('click',()=>{
   pick.value=p.id;$('campaign-platform').value=p.platform;
   form.elements.namedItem('platform_allowed_by_campaign').checked=false;
   $('social-status').textContent='Preset selected. Verify the campaign permits '+p.platform+' before authorizing.';
  });
  const remove=element('button','Remove',item);remove.type='button';remove.className='danger-button';
  remove.addEventListener('click',()=>safe(async()=>{
   if(!token)throw Error('Connect admin token to manage social presets');
   await api('DELETE','/api/social-presets/'+encodeURIComponent(p.id));
   await refreshPresets();
   $('social-status').textContent='Preset removed.';
  }));
 }
 if(!presets.length)element('p','No saved presets yet. Add one of your accounts above after linking it in Content Rewards.',list);
 if(presets.some(p=>p.id===previous))pick.value=previous;
}
async function refreshPresets(){
 if(!token){presets=[];drawPresets();return;}
 const res=await api('GET','/api/social-presets');
 presets=res.presets||[];drawPresets();window.ClipFleetJourney?.setPresets(presets);
}
async function load(){
 const [c,stat]=await Promise.all([api('GET','/api/campaigns'),api('GET','/api/stats')]);
 campaigns=c.campaigns||[];window.ClipFleetJourney?.setCampaigns(campaigns);
 jobs=token?(await api('GET','/api/jobs')).jobs||[]:[];
 $('s-campaigns').textContent=stat.campaigns;
 $('s-active').textContent=stat.active;
 $('s-queued').textContent=stat.queued;
 $('s-ready').textContent=stat.ready;
 drawCampaigns();drawJobs();
 if(token)await refreshPresets();
 if(token)await window.ClipFleetJourney?.refresh();
 setMessage(token?'Admin connected':'Public campaign browsing · connect admin for actions');
}
async function safe(task,messageNode){
 try{return await task();}
 catch(error){(messageNode||$('connection')).textContent=error instanceof Error?error.message:'Request failed';}
}
['filter-search','filter-model','filter-status','filter-budget','filter-rate','filter-sort'].forEach(id=>{
 $(id).addEventListener(id==='filter-search'||id==='filter-budget'||id==='filter-rate'?'input':'change',drawCampaigns);
});
$('filter-reset').addEventListener('click',()=>{
 $('filter-search').value='';$('filter-model').value='all';$('filter-status').value='all';
 $('filter-budget').value='0';$('filter-rate').value='0';$('filter-sort').value='priority';drawCampaigns();
});
$('connect').addEventListener('click',()=>safe(async()=>{
 token=$('token').value.trim();if(!token)throw Error('Enter your admin token');
 await load();$('token').value='';
}));
$('refresh').addEventListener('click',()=>safe(load));
$('discover').addEventListener('click',()=>safe(async()=>{
 if(!token)throw Error('Connect admin first');
 await api('POST','/api/discover',{});await load();
}));
$('plan').addEventListener('click',()=>safe(async()=>{
 if(!token)throw Error('Connect admin first');
 const res=await api('POST','/api/plan',{});
 await load();setMessage(res.planned+' render jobs planned');
}));
$('social-form').addEventListener('submit',event=>{
 event.preventDefault();safe(async()=>{
  if(!token)throw Error('Connect admin first');
  const form=event.currentTarget;
  if(!form.reportValidity())return;
  const data=Object.fromEntries(new FormData(form));data.confirmed_connected=true;
  await api('POST','/api/social-presets',data);
  form.reset();await refreshPresets();
  $('social-status').textContent='Preset saved. Select “Use preset” to add it to a campaign.';
 },$('social-status'));
});
$('campaign-social').addEventListener('change',()=>{
 const p=presets.find(x=>x.id===$('campaign-social').value);
 if(p)$('campaign-platform').value=p.platform;
 form.elements.namedItem('platform_allowed_by_campaign').checked=false;
});
$('prefill-basic').addEventListener('click',()=>{
 const id=form.elements.namedItem('campaign_id').value;
 const c=campaigns.find(x=>x.id===id);
 if(!c){$('draft-status').textContent='Select a campaign first.';return;}
 form.elements.namedItem('product_name').value=(c.title||'').slice(0,100);
 $('draft-status').textContent='Title suggestion filled from public listing; verify the actual product name. No claims or rights were assumed.';
});
$('draft-ai').addEventListener('click',()=>safe(async()=>{
 if(!token)throw Error('Connect admin first');
 const id=form.elements.namedItem('campaign_id').value;
 const brief=$('campaign-brief').value.trim();
 if(!id)throw Error('Select a campaign first');
 if(brief.length<80)throw Error('Paste at least 80 characters of the real official campaign brief');
 const btn=$('draft-ai');btn.disabled=true;$('draft-status').textContent='Generating a grounded draft from your supplied brief…';
 try{
  const r=await api('POST','/api/assist',{campaign_id:id,brief_text:brief});
  let filled=0;
  for(const field of ['product_name','approved_value_prop','approved_cta','required_caption']){
   const value=r.fields?.[field];
   if(typeof value==='string'&&value.trim()){
    form.elements.namedItem(field).value=value.trim();filled++;
   }
  }
  $('draft-status').textContent=filled+' editable field(s) drafted by Workers AI. Verify EVERY field against the campaign brief. Rights evidence, asset permissions and eligibility remain manual.';
 }finally{btn.disabled=false;}
},$('draft-status')));
form.addEventListener('submit',event=>{
 event.preventDefault();safe(async()=>{
  if(!token)throw Error('Connect admin first');
  if(!form.reportValidity())return;
  const data=Object.fromEntries(new FormData(form));
  for(const name of ['verified_eligibility','assets_licensed','brief_reviewed','platform_allowed_by_campaign','requires_preapproval','draft_approved'])
   data[name]=Boolean(form.elements.namedItem(name).checked);
  if(!data.campaign_platform)throw Error('Choose a campaign-permitted platform');
  data.allowed_platforms=[data.campaign_platform];
  delete data.campaign_platform;
  data.max_variants=Number(data.max_variants);
  data.allows_original_graphic=data.allows_original_graphic==='true';
  if(data.requires_preapproval&&!data.draft_approved)throw Error('Obtain brand pre-approval for the actual draft before arming');
  const selected=presets.find(p=>p.id===data.social_preset_id);
  if(selected&&selected.platform!==data.allowed_platforms[0])throw Error('Saved account must match chosen platform');
  if(!data.social_preset_id)delete data.social_preset_id;
  $('approved-status').textContent='Saving reviewed campaign profile…';
  const response=await api('POST','/api/profiles',data);
  $('approved-status').textContent='Campaign '+response.campaign_id.slice(0,8)+' armed. Click Plan approved jobs.';
  await window.ClipFleetJourney?.refresh();
 },$('approved-status'));
});
window.ClipFleetJourney?.initialize({api});
load().catch(e=>setMessage('Public feed not available: '+e.message));
})();