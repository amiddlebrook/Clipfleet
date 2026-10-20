(()=>{
let token='';const $=(id)=>document.getElementById(id);
const api=async (method,path,payload)=>{
 const headers={'Authorization':'Bearer '+token};if(payload!==undefined)headers['Content-Type']='application/json';
 const response=await fetch(path,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload)});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Unknown API error');return data;
};
function el(tag,text,parent){const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);if(parent)parent.append(node);return node;}
function money(n){return typeof n==='number'?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n):'—';}
function refreshState(campaigns,jobs){
 $('s-campaigns').textContent=campaigns.length;
 $('s-active').textContent=campaigns.filter(c=>c.accepting&&c.budget_remaining>=20).length;
 $('s-queued').textContent=jobs.filter(j=>j.status==='queued').length;
 $('s-ready').textContent=jobs.filter(j=>j.status==='ready_for_review').length;
 const tbody=$('campaigns');tbody.replaceChildren();
 const sorted=campaigns.slice().sort((a,b)=>(Number(b.priority_score||0)-Number(a.priority_score||0))||(Number(b.budget_remaining||0)-Number(a.budget_remaining||0)));
 for(const c of sorted){const tr=el('tr');const td=el('td',undefined,tr),a=el('a',c.title||c.id,td);a.href=c.url;a.target='_blank';a.rel='noopener noreferrer';el('small',c.id,td);
 el('td',c.model||'unknown',tr);el('td',money(c.rate),tr);el('td',money(c.budget_remaining),tr);let x=el('td',undefined,tr),badge=el('span',c.accepting?'Open':'Unverified',x);badge.className='badge'+(c.accepting?'':' off');
 const b=el('button','Select',el('td',undefined,tr));b.type='button';b.addEventListener('click',()=>{$('campaign_id').value=c.id;$('campaign_id').focus();});tbody.append(tr);}
 if(!sorted.length){let tr=el('tr');let td=el('td','No indexed campaigns. Click Scan public directory.',tr);td.colSpan=6;tbody.append(tr);}
 $('jobs').replaceChildren();
 if(!jobs.length)el('p','No jobs queued. Verify and authorize a campaign.', $('jobs'));
 for(const j of jobs.slice(0,30)){const d=el('div',undefined,$('jobs'));d.className='job';el('strong',`${j.status.replaceAll('_',' ').toUpperCase()} — ${j.campaign_id}`,d);el('span',`Job ${j.id.slice(0,8)} · ${j.created_at}${j.error?' · '+j.error:''}`,d);}
}
async function load(){const [c,st]=await Promise.all([api('GET','/api/campaigns'),api('GET','/api/stats')]);let jobs=[];
 if(token){const j=await api('GET','/api/jobs');jobs=j.jobs||[];}
 refreshState(c.campaigns||[],jobs);$('s-queued').textContent=st.queued;$('s-ready').textContent=st.ready;
 $('connection').textContent=token?'Admin connected':'Public discovery active · Connect a token for controls';}
async function safe(task){try{await task();}catch(e){$('connection').textContent=e.message||'Error';}}
$('connect').addEventListener('click',()=>safe(async()=>{token=$('token').value.trim();if(!token)throw Error('Enter your admin token');await load();$('token').value='';}));
$('refresh').addEventListener('click',()=>safe(load));
$('discover').addEventListener('click',()=>safe(async()=>{await api('POST','/api/discover',{});await load();}));
$('plan').addEventListener('click',()=>safe(async()=>{const r=await api('POST','/api/plan',{});$('connection').textContent=`${r.planned} render jobs planned`;await load();}));
$('approve').addEventListener('submit',event=>{
 event.preventDefault();safe(async()=>{const form=$('approve');if(!form.reportValidity())return;const d=Object.fromEntries(new FormData(form));
 for(const c of ['verified_eligibility','assets_licensed','brief_reviewed'])d[c]=true;
 d.allows_original_graphic=d.allows_original_graphic==='true';d.max_variants=Number(d.max_variants);
 d.allowed_platforms=['youtube'];
 const message=$('approved-status');message.textContent='Authorizing reviewed campaign…';
 const result=await api('POST','/api/profiles',d);message.textContent=`Campaign ${result.campaign_id.slice(0,8)} armed. Click Plan approved jobs.`;
});});
load().catch(e=>{$('connection').textContent='Public feed not available yet: '+e.message;});
})();
