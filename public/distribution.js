/* Four separately approved and tracked publishing lanes; no direct social posting. */
(()=>{
'use strict';
const platforms=[
 {id:'youtube',label:'YouTube Shorts',upload:'https://studio.youtube.com/'},
 {id:'tiktok',label:'TikTok',upload:'https://www.tiktok.com/upload'},
 {id:'instagram',label:'Instagram Reels',upload:'https://www.instagram.com/'},
 {id:'x',label:'X',upload:'https://x.com/'}
];
const $=id=>document.getElementById(id);
let api=null,authorized=false,campaigns=[],presets=[],selected='',data=null,loading=false;
const node=(tag,txt,parent,cls)=>{
 const n=document.createElement(tag);if(txt!==undefined)n.textContent=String(txt);
 if(cls)n.className=cls;if(parent)parent.append(n);return n;
};
const link=(parent,title,href)=>{
 const a=node('a',title,parent,'distribution-link');
 a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;
};
const field=(parent,title,type='text',placeholder='')=>{
 const l=node('label',title,parent,'distribution-field'),input=node('input',undefined,l);
 input.type=type;input.placeholder=placeholder;return input;
};
const choice=(parent,title,choices)=>{
 const l=node('label',title,parent,'distribution-field'),sel=node('select',undefined,l);
 for(const [value,label] of choices){const o=node('option',label,sel);o.value=value;}
 return sel;
};
const check=(parent,label)=>{
 const l=node('label',undefined,parent,'distribution-check');
 const box=node('input',undefined,l);box.type='checkbox';
 node('span',label,l);return box;
};
const action=(parent,title,fn)=>{
 const btn=node('button',title,parent);btn.type='button';
 btn.addEventListener('click',()=>safe(fn,btn));return btn;
};
function setMessage(message){$('distribution-feedback').textContent=message;}
async function safe(fn,button){
 if(loading)return;
 loading=true;if(button)button.disabled=true;setMessage('');
 try{await fn();}catch(error){setMessage(error.message||'Action could not be completed');}
 finally{loading=false;if(button)button.disabled=false;}
}
async function report(platform,actionName,other={}){
 if(!selected)throw Error('Choose a campaign first');
 await api('POST','/api/distribution/progress',
    {campaign_id:selected,platform,action:actionName,confirm:true,...other});
 await refresh();
}
async function refresh(){
 if(!selected||!authorized||!api){
  data=null;render();return;
 }
 data=await api('GET','/api/distribution?campaign_id='+encodeURIComponent(selected));
 render();
}
function labelStatus(lane){
 if(!lane)return 'Not activated';
 if(lane.status==='queued'){
  if(lane.render_status==='ready_for_review')return 'Video ready for review';
  if(lane.render_status==='rendering')return 'Rendering video';
  if(lane.render_status==='failed')return 'Render failed; inspect run';
  return 'Video queued';
 }
 return lane.status.replaceAll('_',' ');
}
function card(platform){
 const wrapper=node('article',undefined,$('distribution-grid'),'distribution-card');
 const heading=node('div',undefined,wrapper,'distribution-card-top');
 node('h3',platform.label,heading);
 const lane=data?.lanes?.find(t=>t.platform===platform.id);
 node('span',labelStatus(lane),heading,'distribution-badge'+(lane?.submitted_at?' recorded':''));
 const config=node('div',undefined,wrapper,'distribution-configuration');
 const allowed=check(config,'Official campaign explicitly permits '+platform.label+'.');
 const matching=presets.filter(p=>p.platform===platform.id&&p.confirmed_connected);
 const s=choice(config,'Publishing account verified in Content Rewards',
   [['','Choose account'],...matching.map(p=>[p.id,'@'+p.handle])]);
 if(lane){s.value=lane.preset_id;allowed.checked=true;}
 else if(matching.length===1)s.value=matching[0].id;
 s.dataset.platform=platform.id;allowed.dataset.platform=platform.id;
 if(lane?.job_id){s.disabled=true;allowed.disabled=true;}
 if(!matching.length){
  const note=node('p','No connected account preset. Add '+platform.label+' in Social account presets, after verifying the account inside Content Rewards.',config,'distribution-muted');
  link(config,'Go to social presets ↓','#social-section').target='_self';
 }
 if(!lane){
  node('p','Not yet authorized. Only include this lane if the brand brief accepts it.',wrapper,'distribution-muted');
  return;
 }
 const nav=node('div',undefined,wrapper,'distribution-nav');
 link(nav,'Official campaign ↗',data.campaign.url);
 link(nav,'Open '+platform.label+' ↗',platform.upload);
 if(lane.profile_url)link(nav,'View account ↗',lane.profile_url);
 if(lane.actions_run_url)link(nav,'Download this MP4 ↗',lane.actions_run_url);
 const status=node('p',undefined,wrapper,'distribution-muted');
 status.textContent='Job: '+(lane.job_id?lane.job_id.slice(0,8):'not planned')+' · Render: '+(lane.render_status||'not started');
 if(lane.render_error)node('p',lane.render_error,wrapper,'distribution-error');
 if(lane.status==='queued'&&lane.render_status==='failed'){
  action(wrapper,'Reset failed render for this platform',async()=>{
   if(!confirm('The previous FFmpeg job failed. Reset only this platform lane and requeue a separate render?'))return;
   await report(platform.id,'retry_render');
  });
 }
 if(lane.job_id&&lane.render_status==='ready_for_review'&&lane.status==='queued'){
  const attest=check(wrapper,'I watched the actual platform-specific MP4, verified claims, disclosure, required caption, and sponsor compliance.');
  action(wrapper,'Mark '+platform.label+' video reviewed',async()=>{
   if(!attest.checked)throw Error('Watch and review the real MP4 before proceeding.');
   await report(platform.id,'review');
  });
 }
 if(lane.status==='reviewed'){
  const post=field(wrapper,'Published public post URL','url','https://...');
  const published=field(wrapper,'Actual post time (your local time)','datetime-local');
  const attest=check(wrapper,'I published the reviewed video to my connected '+platform.label+' account.');
  action(wrapper,'Record published '+platform.label+' post',async()=>{
   if(!attest.checked||!post.value||!published.value)throw Error('Enter the real published post URL and exact posting time.');
   await report(platform.id,'published',{published_url:post.value.trim(),published_at:new Date(published.value).toISOString()});
  });
 }
 if(lane.status==='published'){
  const when=Date.parse(lane.published_at),minutes=Math.max(0,Math.ceil((when+30*60000-Date.now())/60000));
  node('p',minutes?'Submit within ~'+minutes+' minute(s) of your reported posting time.':'The reported 30-minute submission window has expired.',wrapper,minutes?'distribution-deadline':'distribution-error');
  link(wrapper,'Open this campaign to submit ↗',data.campaign.url);
  const url=node('p','Post URL: '+lane.published_url,wrapper,'distribution-posturl');
  const reference=field(wrapper,'Optional Content Rewards submission receipt','text','Receipt ID (if supplied)');
  const attest=check(wrapper,'I actually submitted this '+platform.label+' post to this Content Rewards campaign.');
  action(wrapper,'Confirm actual submission',async()=>{
   if(!attest.checked)throw Error('Only record after submitting on Content Rewards.');
   await report(platform.id,'submitted',{submission_reference:reference.value.trim()});
  });
 }
 if(['submitted','accepted','rejected','paid'].includes(lane.status)){
  node('p','Submission recorded by you. ClipFleet does not independently verify sponsor approval or earnings.',wrapper,'distribution-muted');
  if(lane.published_url)link(wrapper,'Open public post ↗',lane.published_url);
  const result=choice(wrapper,'Actual sponsor decision / payout',[['','Choose confirmed outcome'],['accepted','Approved'],['rejected','Rejected'],['paid','Payment received']]);
  const attest=check(wrapper,'I checked the actual Content Rewards submission or payout status.');
  action(wrapper,'Update verified-by-me result',async()=>{
   if(!result.value||!attest.checked)throw Error('Select the real observed outcome before recording it.');
   await report(platform.id,'outcome',{outcome:result.value});
  });
  action(wrapper,'Start another distinct '+platform.label+' clip',async()=>{
   if(!confirm('Preserve the previous submission record and create a NEW, unique video on this platform?'))return;
   await report(platform.id,'next');
  });
 }
}
function render(){
 const wrap=$('distribution-grid');wrap.replaceChildren();$('distribution-ledger').replaceChildren();
 if(!selected){node('p','Choose a campaign above; each brand has its own set of permitted social networks.',wrap,'empty');return;}
 if(!authorized){node('p','Connect your administrator token to view and manage platform lanes.',wrap,'empty');return;}
 if(!data){node('p','Press Refresh lanes to load independent YouTube, TikTok, Instagram and X progress.',wrap,'empty');return;}
 for(const p of platforms)card(p);
 const ledger=$('distribution-ledger');node('h3','Recorded social submissions · all platforms',ledger);
 const subs=data.submissions||[];
 if(!subs.length)node('p','No submissions recorded for this campaign yet.',ledger,'distribution-muted');
 for(const sub of subs){
  const row=node('div',undefined,ledger,'distribution-ledger-row');
  node('strong',sub.platform.toUpperCase()+' · '+(sub.outcome==='pending'?'Pending (self-reported)':sub.outcome),row);
  link(row,'Public post ↗',sub.published_url);
  node('span','Submitted (reported): '+sub.submitted_at,row);
  const decision=choice(row,'Earlier sponsor decision',[['','Update status'],['accepted','Accepted'],['rejected','Rejected'],['paid','Payment received']]);
  const attested=check(row,'I verified this actual earlier submission result.');
  action(row,'Save result',async()=>{
   if(!attested.checked||!decision.value)throw Error('Check the real sponsor decision first.');
   await report(sub.platform,'history_outcome',{submission_id:sub.id,outcome:decision.value});
  });
 }
 const rows=data.lanes||[];
 if(rows.length)setMessage(rows.length+' platform lane(s) configured. Distinct renders and submission status are tracked separately.');
}
function setCampaigns(items){
 campaigns=items||[];
 const picker=$('distribution-campaign'),old=selected||picker.value;picker.replaceChildren();
 const empty=node('option','Choose a campaign',picker);empty.value='';
 for(const c of campaigns){const option=node('option',c.title||c.id,picker);option.value=c.id;}
 if(campaigns.some(c=>c.id===old))picker.value=old;
}
function selectCampaign(c){
 selected=c?.id||'';
 $('distribution-campaign').value=selected;
 data=null;render();
 if(selected&&authorized)refresh().catch(e=>setMessage(e.message));
}
async function setup(){
 if(!data)throw Error('Select and load a campaign first.');
 const lanes=[];
 for(const p of platforms){
  const c=$('distribution-grid').querySelector('input[data-platform="'+p.id+'"]');
  const a=$('distribution-grid').querySelector('select[data-platform="'+p.id+'"]');
  if(!c||!a)continue;
  if(c.checked){
   if(!a.value)throw Error('Choose a connected '+p.label+' account for each selected lane.');
   lanes.push({platform:p.id,preset_id:a.value,campaign_permits_platform:true});
  }
 }
 if(!lanes.length)throw Error('Confirm at least one permitted network and social account.');
 const result=await api('POST','/api/distribution/setup',{campaign_id:selected,lanes,confirm:true});
 await refresh();
 setMessage(result.configured.join(', ')+' lanes configured. Click Queue distinct clips when the campaign is open and reviewed.');
}
$('distribution-campaign').addEventListener('change',()=>{
 selectCampaign(campaigns.find(c=>c.id===$('distribution-campaign').value)||null);
});
$('distribution-refresh').addEventListener('click',()=>safe(refresh));
$('distribution-setup').addEventListener('click',()=>safe(setup));
$('distribution-plan').addEventListener('click',()=>safe(async()=>{
 const result=await api('POST','/api/distribution/plan',{confirm:true});
 await refresh();
 setMessage(result.planned+' unique platform-targeted render job(s) queued. GitHub Actions produces at most two clips per pipeline run.');
}));
window.ClipFleetDistribution={
 initialize:args=>{api=args.api;},
 setAuthorized:yes=>{authorized=Boolean(yes);if(!authorized){data=null;render();}},
 setCampaigns,
 setPresets:items=>{presets=items||[];if(data)render();},
 select:selectCampaign,
 refresh
};
})();