/* ClipFleet guided operator workflow. Self-reported steps never imply API verification. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
let api=null,campaigns=[],presets=[],current=null,last=null,inFlight=false;
const stages=[
 ['joined','01','Join campaign','Join the campaign in Content Rewards and verify that you meet its requirements.'],
 ['social','02','Connect publishing account','Link a real social account in Content Rewards and confirm this campaign allows that platform.'],
 ['brief','03','Review the full brief','Read all rules, required wording, permitted formats, platform restrictions and minimum views.'],
 ['rights','04','Confirm content permissions','Find the exact authorized footage or permitted original-graphics policy. Record where permission is documented.'],
 ['profile','05','Approve creative configuration','Let AI propose copy, then verify every field, select an approved platform and authorize the profile.'],
 ['render','06','Produce clips','ClipFleet plans jobs and GitHub Actions renders approved jobs.'],
 ['review','07','Review produced video','Download the MP4, compare it against the sponsor brief, check disclosure and inspect quality.'],
 ['published','08','Publish on your social account','Post the reviewed video using the already connected, campaign-permitted platform.'],
 ['submitted','09','Submit to Content Rewards','Submit the public post URL to the correct campaign within 30 minutes of publication.'],
 ['outcome','10','Track payout decision','Record the actual sponsor verdict or payout only after it appears in Content Rewards.']
];
const destinations={
 youtube:['Open YouTube Studio','https://studio.youtube.com/'],
 tiktok:['Open TikTok upload','https://www.tiktok.com/upload'],
 instagram:['Open Instagram','https://www.instagram.com/'],
 facebook:['Open Facebook','https://www.facebook.com/'],
 x:['Open X','https://x.com/']
};
const artifacts='https://github.com/amiddlebrook/Clipfleet/actions/workflows/agent-loop.yml';
const connectGuide='https://help.contentrewards.com/en/articles/16746780-connect-your-social-accounts';
const submitGuide='https://help.contentrewards.com/en/articles/15319814-submit-a-video';
const text=(tag,value,parent,className)=>{
 const e=document.createElement(tag);
 if(value!==undefined)e.textContent=String(value);
 if(className)e.className=className;
 if(parent)parent.append(e);
 return e;
};
const link=(parent,label,href)=>{
 const a=text('a',label,parent,'journey-link');
 a.href=href;a.target=href.startsWith('#')?'_self':'_blank';
 if(!href.startsWith('#'))a.rel='noopener noreferrer';
 return a;
};
const button=(parent,label,handler)=>{
 const b=text('button',label,parent,'journey-action');
 b.type='button';b.addEventListener('click',()=>run(handler,b));return b;
};
const input=(parent,label,type='text',placeholder='')=>{
 const l=text('label',label,parent,'journey-field');
 const e=document.createElement('input');
 e.type=type;e.placeholder=placeholder;l.append(e);return e;
};
const select=(parent,label,options)=>{
 const l=text('label',label,parent,'journey-field'),s=document.createElement('select');l.append(s);
 options.forEach(([value,title])=>{const o=text('option',title,s);o.value=value;});
 return s;
};
const confirmBox=(parent,label)=>{
 const l=text('label',undefined,parent,'journey-check');
 const c=document.createElement('input');c.type='checkbox';l.append(c);
 text('span',label,l);return c;
};
const messages=msg=>{$('journey-error').textContent=msg||'';};
async function run(fn,buttonNode){
 if(inFlight)return;
 if(!api){messages('Connect your administrator token before updating progress.');return;}
 inFlight=true;messages('');if(buttonNode)buttonNode.disabled=true;
 try{await fn();await refresh();}
 catch(e){messages(e.message||'Unable to update progress');}
 finally{inFlight=false;if(buttonNode)buttonNode.disabled=false;}
}
async function send(action,extra={}){
 if(!last)throw Error('Choose a campaign before making changes.');
 return api('POST','/api/workflow',{campaign_id:current,action,confirm:true,...extra});
}
function actionCard(parent,key,workflow){
 const isDone=Boolean(workflow.completed[key]),isCurrent=workflow.next_step===key;
 const [_,index,name,description]=stages.find(row=>row[0]===key);
 const card=text('section',undefined,parent,'journey-step '+(isDone?'is-done':isCurrent?'is-current':'is-locked'));
 const top=text('div',undefined,card,'journey-step-head');
 text('span',index,top,'journey-step-number');
 const heading=text('div',undefined,top,'journey-step-heading');
 text('h4',name,heading);text('p',description,heading);
 text('span',isDone?'Complete':isCurrent?'Next':'Waiting',top,'journey-state');
 if(isDone){
  if(key==='submitted')text('p','Reported as submitted by you; ClipFleet cannot verify acceptance.',card,'journey-muted');
  if(key==='outcome')text('p','Reported result: '+workflow.state.outcome+'. This is not a payout verification.',card,'journey-muted');
  return;
 }
 const area=text('div',undefined,card,'journey-controls');
 if(!isCurrent){
  if(key==='published'||key==='submitted')text('p','No posting or submission occurs automatically.',area,'journey-muted');
  return;
 }
 const campaignUrl=workflow.campaign.url;
 if(key==='joined'){
  link(area,'Open this campaign / Join ↗',campaignUrl);
  button(area,'I joined and verified eligibility',async()=>send('joined'));
 }else if(key==='social'){
  link(area,'How to connect accounts in Content Rewards ↗',connectGuide);
  link(area,'Manage saved account presets ↓','#social-section');
  const s=select(area,'Choose a preset you confirmed is connected',[
   ['', 'Choose social account'],...presets.map(p=>[p.id,p.platform.toUpperCase()+' · @'+p.handle])]);
  const agreed=confirmBox(area,'I checked the campaign rules and this selected platform is allowed.');
  button(area,'Confirm connected account',async()=>{
   if(!s.value||!agreed.checked)throw Error('Choose a connected preset and confirm that the campaign permits it.');
   await send('social',{social_preset_id:s.value,platform_allowed_by_campaign:true});
  });
 }else if(key==='brief'){
  link(area,'Read the full official campaign brief ↗',campaignUrl);
  link(area,'Open AI-assisted draft editor ↓','#campaign-brief');
  button(area,'I reviewed the complete brief',async()=>send('brief'));
 }else if(key==='rights'){
  link(area,'View approved assets and rules ↗',campaignUrl);
  const e=input(area,'Specific license / authorized asset reference','text','e.g. campaign brief section or sponsor asset URL');
  e.maxLength=500;
  button(area,'I confirmed usage rights',async()=>{
   if(e.value.trim().length<12)throw Error('Enter the source documenting your actual content permissions.');
   await send('rights',{rights_evidence:e.value.trim()});
  });
 }else if(key==='profile'){
  link(area,'Open AI draft and authorization form ↓','#approve');
  text('p','Fill or AI-draft the content fields, select your permitted platform, and confirm required rights. When saved, this stage advances automatically.',area,'journey-muted');
  button(area,'Refresh after approving profile',refresh);
 }else if(key==='render'){
  link(area,'Open the GitHub rendering workflow ↗',artifacts);
  text('p',workflow.jobs.length+' total jobs for this campaign; '+workflow.ready_jobs.length+' ready. Queueing is automated, but the next GitHub Actions run may be required.',area,'journey-muted');
  button(area,'Plan approved jobs',async()=>{
   await api('POST','/api/plan',{});
   await refresh();
  });
 }else if(key==='review'){
  link(area,'Download videos from GitHub Actions artifacts ↗',artifacts);
  const pick=select(area,'Choose the ready video you reviewed',[
   ['', 'Select reviewed job'],...workflow.ready_jobs.map(j=>[j.id,j.id.slice(0,8)+' · '+j.created_at])]);
  const artifactLink=link(area,'Open render run to download MP4 ↗',artifacts);
  pick.addEventListener('change',()=>{const selected=workflow.ready_jobs.find(j=>j.id===pick.value);artifactLink.href=selected?.actions_run_url||artifacts;});
  const agree=confirmBox(area,'I actually watched this completed MP4 and checked it against the sponsor brief.');
  button(area,'Mark this render reviewed',async()=>{
   if(!pick.value||!agree.checked)throw Error('Select and review a real completed video first.');
   await send('review',{job_id:pick.value});
  });
 }else if(key==='published'){
  const dest=destinations[workflow.state.platform];
  if(dest)link(area,dest[0]+' ↗',dest[1]);
  const u=input(area,'Public published post URL','url','https://.../shorts/... or /reel/...');
  const time=input(area,'Actual publication time (leave blank if publishing now)','datetime-local');
  const agree=confirmBox(area,'I published the reviewed clip myself on the selected, connected social account.');
  button(area,'Record published clip',async()=>{
   if(!agree.checked)throw Error('Only record this stage after the video is genuinely published.');
   await send('published',{published_url:u.value.trim(),published_at:time.value?new Date(time.value).toISOString():new Date().toISOString()});
  });
 }else if(key==='submitted'){
  const window=workflow.submission_window;
  const warning=window&&window.expired?'Your recorded 30-minute window has expired. Follow the campaign rules; no payout is guaranteed.':
   (window?window.minutes_remaining+' minute(s) remain based on your reported publication time.':'Publish before submitting.');
  text('p',warning,area,window?.expired?'journey-urgent':'journey-caution');
  link(area,'Go directly to campaign submission ↗',campaignUrl);
  link(area,'Read how to submit a clip ↗',submitGuide);
  text('p','The published URL to submit:',area,'journey-muted');
  const posted=input(area,'Recorded public URL','text');posted.value=workflow.state.published_url||'';posted.readOnly=true;
  const ref=input(area,'Optional Content Rewards submission reference','text','Submission ID or receipt (if provided)');ref.maxLength=300;
  const agree=confirmBox(area,'I actually submitted the post URL in Content Rewards for this campaign.');
  button(area,'Confirm actual submission',async()=>{
   if(!agree.checked)throw Error('Do not confirm before submitting on Content Rewards.');
   await send('submitted',{submission_reference:ref.value});
  });
 }else if(key==='outcome'){
  link(area,'Open Content Rewards to check your submission ↗','https://contentrewards.com/');
  const choose=select(area,'Confirmed result',[['','Choose actual outcome'],['accepted','Accepted'],['rejected','Rejected'],['paid','Payment actually received']]);
  const agree=confirmBox(area,'I checked the real Content Rewards submission or payout status.');
  button(area,'Record verified-by-me outcome',async()=>{
   if(!agree.checked||!choose.value)throw Error('Confirm the true observed outcome.');
   await send('outcome',{outcome:choose.value});
  });
 }
}
function drawSubmissions(workflow){
 const holder=$('journey-submissions');holder.replaceChildren();
 const list=workflow.submissions||[];
 const head=text('div',undefined,holder,'journey-submissions-head');
 text('h3','Submission ledger ('+list.length+')',head);
 if(workflow.completed.submitted)button(head,'Start tracking another clip',async()=>send('next_clip'));
 text('p','This ledger preserves earlier posted URLs and your manually reported statuses. It does not query Content Rewards or confirm payouts.',holder,'journey-muted');
 if(!list.length){text('p','No submissions recorded yet.',holder,'journey-muted');return;}
 for(const item of list){
  const row=text('div',undefined,holder,'journey-submission');
  const info=text('div',undefined,row,'journey-submission-info');
  text('strong',item.platform.toUpperCase()+' · '+item.outcome.toUpperCase(),info);
  link(info,'Open submitted public post ↗',item.published_url);
  text('small','Recorded submitted: '+item.submitted_at+' · job '+item.job_id.slice(0,8),info);
  const update=select(row,'Update recorded sponsor result',[
   ['','Choose verified-by-you result'],['accepted','Accepted'],['rejected','Rejected'],['paid','Actually paid']
  ]);
  const attested=confirmBox(row,'I checked the real outcome in Content Rewards.');
  button(row,'Update',async()=>{
   if(!attested.checked||!update.value)throw Error('Check the real status before recording.');
   await send('submission_outcome',{submission_id:item.id,outcome:update.value});
  });
 }
}
function draw(workflow){
 last=workflow;$('journey-empty').hidden=true;$('journey-content').hidden=false;
 $('journey-title').textContent=workflow.campaign.title||workflow.campaign.id;
 $('journey-done').textContent=workflow.completed_count+'/'+workflow.steps.length;
 $('journey-meter').style.width=(100*workflow.completed_count/workflow.steps.length)+'%';
 const next=stages.find(x=>x[0]===workflow.next_step);
 $('journey-next').textContent=next?'Next: '+next[2]:'All steps tracked. No payout is implied by completion.';
 $('journey-warning').textContent=workflow.submission_window&&!workflow.completed.submitted?
  (workflow.submission_window.expired?'Recorded submission window expired.':'Submit within '+workflow.submission_window.minutes_remaining+' minutes of your reported publishing time.'):'Posting and sponsor submission require your explicit action. No auto-revenue claims.';
 const holder=$('journey-steps');holder.replaceChildren();
 for(const [key] of stages)actionCard(holder,key,workflow);
 drawSubmissions(workflow);
}
async function refresh(){
 if(!api||!current)return;
 const [w,ev]=await Promise.all([api('GET','/api/workflow?campaign_id='+encodeURIComponent(current)),api('GET','/api/workflow/events?campaign_id='+encodeURIComponent(current))]);
 draw(w.workflow);
 const holder=$('journey-events');holder.replaceChildren();
 if(!(ev.events||[]).length)text('p','No confirmations recorded.',holder,'journey-muted');
 for(const event of ev.events||[]){
  const row=text('p',event.created_at+' · '+event.action.replaceAll('_',' '),holder,'journey-history-row');
 }
}
function setCampaigns(items){
 campaigns=items||[];const picker=$('journey-picker'),old=picker.value;picker.replaceChildren();
 const empty=text('option','Select a campaign to track',picker);empty.value='';
 for(const c of campaigns){const option=text('option',c.title||c.id,picker);option.value=c.id;}
 if(current&&campaigns.some(c=>c.id===current))picker.value=current;
 else if(old&&campaigns.some(c=>c.id===old))picker.value=old;
}
function selectCampaign(c){
 current=c?.id||null;last=null;
 $('journey-picker').value=current||'';
 window.ClipFleetDistribution?.select(c);
 if(current){
  const field=document.getElementById('campaign_id');if(field)field.value=current;
  const status=document.getElementById('draft-status');if(status)status.textContent='Selected '+(c.title||current)+'. Paste the official brief before asking AI to draft fields.';
 }
 $('journey-empty').hidden=Boolean(current);$('journey-content').hidden=true;
 messages('');
 if(!current)return;
 if(!api){messages('Connect admin to track campaign milestones.');return;}
 refresh().catch(e=>messages(e.message));
}
function initialize(options){api=options.api;}
$('journey-picker').addEventListener('change',()=>{
 const c=campaigns.find(c=>c.id===$('journey-picker').value);
 selectCampaign(c||null);
});
$('journey-refresh').addEventListener('click',()=>run(refresh));
window.ClipFleetJourney={initialize,setCampaigns,setPresets:p=>{presets=p||[];},select:selectCampaign,refresh};
})();