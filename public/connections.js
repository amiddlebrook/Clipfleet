/* Creator onboarding hub: links, saved progress, no fake OAuth flows or credentials. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const definitions=[
 {key:'contentrewards',group:'accounts',name:'Content Rewards',symbol:'CR',tone:'mint',
  detail:'Creator campaigns, submissions and verification. Social accounts must be connected here.',
  primary:['Open Content Rewards','https://contentrewards.com/c/discover'],
  others:[['How to connect social accounts','https://help.contentrewards.com/en/articles/16746780-connect-your-social-accounts']],
  check:'I signed in to Content Rewards and can access its creator dashboard.'},
 {key:'whop',group:'accounts',name:'Whop payouts',symbol:'W',tone:'purple',
  detail:'Withdraw eligible Content Rewards earnings. Whop may require identity/payout verification.',
  primary:['Open Whop','https://whop.com/'],
  others:[['Set up withdrawals','https://help.whop.com/en/articles/10336709-how-to-setup-payouts-withdrawal']],
  check:'I signed into Whop and set up or verified the withdrawal account required for payouts.'},
 {key:'openrouter',group:'accounts',name:'OpenRouter · Free AI',symbol:'OR',tone:'blue',
  detail:'Use your existing free models. Create an API key and keep it in the LOCAL .env file — never paste it into ClipFleet or GitHub.',
  primary:['Manage API keys','https://openrouter.ai/settings/keys'],
  others:[['Explore zero-cost models','https://openrouter.ai/models?pricing=free'],
          ['Free model router','https://openrouter.ai/openrouter/free']],
  check:'I have an OpenRouter API key and will configure it only in my local ClipFleet .env.'},
 {key:'local_browser',group:'accounts',name:'Local Browser Agent',symbol:'AI',tone:'mint',
  detail:'Browser Use + OpenRouter on your Windows computer. No Grok Bot, Cursor, local GPU or paid model required. AI reviews campaign briefs; publishing stays with you.',
  primary:['Windows setup script','https://github.com/amiddlebrook/Clipfleet/blob/main/scripts/setup-openrouter-agent.ps1'],
  others:[['Local agent usage guide','https://github.com/amiddlebrook/Clipfleet/blob/main/docs/OPENROUTER-FREE-AGENT.md'],
          ['Browser Use open source','https://github.com/browser-use/browser-use']],
  check:'I installed the local agent, saved my OpenRouter key locally and ran the key-check command.'},
 {key:'youtube',group:'social',name:'YouTube Shorts',symbol:'▶',tone:'red',
  detail:'Google/YouTube channel. Connect the correct channel within Content Rewards.',
  primary:['Open YouTube','https://www.youtube.com/'],
  others:[['Link via Content Rewards','https://help.contentrewards.com/en/articles/16746780-connect-your-social-accounts']],
  check:'Content Rewards currently shows my intended YouTube channel as Connected.'},
 {key:'tiktok',group:'social',name:'TikTok',symbol:'♪',tone:'cyan',
  detail:'Connect your TikTok creator account in Content Rewards before publishing.',
  primary:['Open TikTok','https://www.tiktok.com/'],
  others:[['Link via Content Rewards','https://help.contentrewards.com/en/articles/16746780-connect-your-social-accounts']],
  check:'Content Rewards currently shows my intended TikTok account as Connected.'},
 {key:'instagram',group:'social',name:'Instagram Reels',symbol:'◎',tone:'pink',
  detail:'Use an eligible Instagram Business account, then connect it in Content Rewards.',
  primary:['Open Instagram','https://www.instagram.com/'],
  others:[['Connect / Business account steps','https://help.contentrewards.com/en/articles/16746780-connect-your-social-accounts']],
  check:'My Instagram Business account is connected and shown as Connected inside Content Rewards.'},
 {key:'x',group:'social',name:'X',symbol:'X',tone:'gray',
  detail:'Connect your actual X publishing account in Content Rewards.',
  primary:['Open X','https://x.com/'],
  others:[['Link via Content Rewards','https://help.contentrewards.com/en/articles/16746780-connect-your-social-accounts']],
  check:'Content Rewards currently shows my intended X account as Connected.'}
];
let api=null,authenticated=false,progress={steps:{},social_presets:{},grokbot_tasks:{}},busy=false;
const el=(tag,text,parent,cls)=>{
 const e=document.createElement(tag);
 if(text!==undefined)e.textContent=String(text);
 if(cls)e.className=cls;
 if(parent)parent.append(e);
 return e;
};
const makeLink=(parent,label,url,primary=false)=>{
 const a=el('a',label,parent,'connection-link'+(primary?' connection-primary':''));
 a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;
};
const message=text=>$('connection-hub-feedback').textContent=text||'';
function statusFor(def){
 if(!authenticated)return 'Not checked';
 const saved=progress.steps?.[def.key];
 return saved?.completed?'Marked done by you':'Not confirmed';
}
function draw(){
 const list=$('connection-cards');list.replaceChildren();
 let complete=0;
 for(const section of [{id:'accounts',title:'1 · Core accounts and Grok Bot'},{id:'social',title:'2 · Publishing outlets'}]){
  const group=el('section',undefined,list,'connection-group');
  el('h3',section.title,group);
  const grid=el('div',undefined,group,'connection-grid');
  for(const def of definitions.filter(x=>x.group===section.id)){
   const confirmed=!!(authenticated&&progress.steps?.[def.key]?.completed);
   if(confirmed)complete++;
   const card=el('article',undefined,grid,'connection-card'+(confirmed?' connection-done':''));
   const top=el('div',undefined,card,'connection-card-top');
   el('div',def.symbol,top,'connection-service-icon connection-tone-'+def.tone);
   const heading=el('div',undefined,top,'connection-name');
   el('h4',def.name,heading);
   const status=el('span',statusFor(def),heading,'connection-status'+(confirmed?' done':''));
   el('p',def.detail,card,'connection-desc');
   if(def.group==='social'){
    const count=Number(progress.social_presets?.[def.key]||0);
    el('p',count?'Saved social presets: '+count+' (user-confirmed, not API-verified)':'No social preset saved yet',card,'connection-account-note');
   }
   const links=el('div',undefined,card,'connection-link-row');
   makeLink(links,def.primary[0]+' ↗',def.primary[1],true);
   for(const [label,url] of def.others)makeLink(links,label+' ↗',url);
   if(def.group==='social'){
    const save=el('a','Save ClipFleet preset ↓',links,'connection-link');
    save.href='#social-section';
   }
   if(def.key==='grokbot_webhook'){
    const guide=makeLink(links,'ClipFleet setup guide ↗','https://github.com/amiddlebrook/Clipfleet/blob/main/docs/GROKBOT-INTEGRATION.md');
   }
   const bottom=el('div',undefined,card,'connection-card-bottom');
   const help=el('span',confirmed?'Saved setup confirmation':'Confirm setup after completing it on the provider site',bottom,'connection-status-hint');
   const button=el('button',confirmed?'Mark not done':'I connected this',bottom,
       confirmed?'connection-confirm disconnect':'connection-confirm');
   button.type='button';button.disabled=!authenticated||busy;
   button.addEventListener('click',()=>mark(def,!confirmed));
  }
 }
 $('connection-progress').textContent=complete+' of '+definitions.length+' marked complete';
 $('connection-summary').textContent=authenticated?
    'Saved to your private Cloudflare D1 checklist • self-confirmed, not independently OAuth-verified':
    'Connect your ClipFleet administrator token above to save setup progress.';
 $('connection-meter-fill').style.width=(complete/definitions.length*100)+'%';
}
async function refresh(){
 if(!authenticated||!api){draw();return;}
 const data=await api('GET','/api/onboarding');
 progress=data;draw();message('');
}
async function mark(def,complete){
 if(!authenticated||!api)return message('Connect the ClipFleet admin token first.');
 const wording=complete?def.check:'I want to clear this setup confirmation.';
 if(!window.confirm(wording+'\n\nContinue?'))return;
 if(busy)return;busy=true;draw();
 try{
  await api('POST','/api/onboarding',{step_id:def.key,completed:complete,confirm:true});
  await refresh();
  message((complete?'Saved':'Cleared')+' your '+def.name+' checklist confirmation. ClipFleet cannot verify third-party account permissions automatically.');
 }catch(error){message(error.message||'Unable to update setup status.');}
 finally{busy=false;draw();}
}
$('connection-refresh').addEventListener('click',async()=>{
 try{await refresh();}catch(error){message(error.message);}
});
window.ClipFleetConnections={
 initialize:opts=>{api=opts.api;draw();},
 setAuthorized:value=>{
  authenticated=Boolean(value);
  if(!authenticated)progress={steps:{},social_presets:{},grokbot_tasks:{}};
  draw();
 },
 refresh
};
draw();
})();