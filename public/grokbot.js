/* Grok Bot handoff status: never displays tokens or treats webhook=200 as task completion. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const el=(tag,label,parent,className)=>{
 const n=document.createElement(tag);
 if(label!==undefined)n.textContent=String(label);
 if(className)n.className=className;
 if(parent)parent.append(n);
 return n;
};
const link=(parent,label,href)=>{
 const a=el('a',label,parent,'grokbot-link');
 a.href=href;a.rel='noopener noreferrer';a.target='_blank';
 return a;
};
let api=null,auth=false,latestJobs=[],taskRows=[],running=false;
const setStatus=msg=>{$('grokbot-status').textContent=msg;};
async function refresh(){
 if(!auth||!api){setStatus('Connect the administrator token to inspect Grok Bot tasks.');return;}
 try{
  const data=await api('GET','/api/grokbot/tasks');
  taskRows=data.tasks||[];
  render(data.callback_configured===true);
  setStatus('Grok Bot callback: '+(data.callback_configured?'configured':'not configured')+
    '. Accepted = webhook run started, NOT that publishing or submission succeeded. Configure webhook URL/key as GitHub repository secrets.');
 }catch(err){setStatus(err.message||'Could not fetch Grok Bot handoffs');}
}
async function safe(cb){
 if(running)return;running=true;
 try{await cb();}catch(error){setStatus(error.message||'Grok Bot action failed');}
 finally{running=false;}
}
function render(callbackReady){
 const target=$('grokbot-tasks');target.replaceChildren();
 const ready=latestJobs.filter(j=>j.status==='ready_for_review' && j.actions_run_url &&
     !taskRows.some(t=>t.job_id===j.id));
 if(ready.length){
  const unsent=el('section',undefined,target,'grokbot-unassigned');
  el('strong',ready.length+' previously rendered video(s) not queued for Grok Bot',unsent);
  for(const job of ready.slice(0,6)){
   const row=el('div',undefined,unsent,'grokbot-item');
   el('span','Render '+job.id.slice(0,8),row);
   const button=el('button','Queue for bot review',row);
   button.type='button';
   button.addEventListener('click',()=>safe(async()=>{
    await api('POST','/api/grokbot/queue',{job_id:job.id});
    await refresh();
   }));
  }
 }
 if(!taskRows.length){
  el('p','No Bot tasks in D1. New approved renders queue automatically. Configure the webhook to start Grok Bot routines.',target,'empty');return;
 }
 for(const task of taskRows){
  const row=el('div',undefined,target,'grokbot-task');
  const head=el('div',undefined,row,'grokbot-task-head');
  el('strong',(task.title||task.campaign_id||'Campaign')+' · '+task.job_id.slice(0,8),head);
  el('span',task.status.toUpperCase(),head,'grokbot-badge grokbot-'+task.status);
  const detail=el('p',undefined,row,'grokbot-muted');
  detail.textContent=task.status==='queued'?'Waiting for GitHub dispatcher (webhook secrets needed).':
   task.status==='dispatching'?'Sending the trigger; a webhook timeout may be ambiguous.':
   task.status==='accepted'?'Grok Bot accepted the webhook call; check Grok Bot chat for completion.':
   task.status==='reported'?'Grok Bot sent an unverified activity report.':
   task.status==='failed'?'Trigger failed or Bot reported an error; inspect webhook and account.':
   'Agent reports this task is blocked.';
  const actions=el('div',undefined,row,'grokbot-actions');
  if(task.actions_run_url)link(actions,'Render artifact ↗',task.actions_run_url);
  if(task.campaign_url)link(actions,'Campaign ↗',task.campaign_url);
  if(task.reported_action)el('p','Bot reported: '+task.reported_action.replaceAll('_',' ')+' — '+(task.note||'(no note)'),row,'grokbot-note');
  if(task.status==='failed'&&task.webhook_http_status!==null&&task.webhook_http_status!==200&&task.attempts<4){
   const retry=el('button','Retry definite failure',actions);retry.type='button';
   retry.addEventListener('click',()=>safe(async()=>{
    if(!confirm('The previous webhook did not return HTTP 200. Retry only after checking no bot is running?'))return;
    await api('POST','/api/grokbot/requeue',{task_id:task.id,confirm:true});
    await refresh();
   }));
  }
 }
 if(!callbackReady)el('p','For Grok Bot to report back automatically, set a distinct GROKBOT_CALLBACK_TOKEN in GitHub and securely on the Bot computer; never share the dashboard admin token.',target,'grokbot-muted');
}
$('grokbot-refresh').addEventListener('click',()=>safe(refresh));
window.ClipFleetGrok={
 initialize:({api:request})=>{api=request;},
 setAccess:yes=>{auth=Boolean(yes);if(!auth){taskRows=[];render(false);}},
 setJobs:rows=>{latestJobs=rows||[];},
 refresh
};
})();
