#!/usr/bin/env python3
"""Bridge authenticated ClipFleet review tasks to documented Grok Bot webhook routines.

A 200 confirms a routine run was accepted; NEVER means it finished or published.
No creator tokens, private briefs, admin secrets or copyrighted media are sent.
"""
import json, os, sys, time, urllib.request, urllib.error
from urllib.parse import urlparse

BASE=os.environ.get('CLIPFLEET_WORKER_URL','').rstrip('/')
TOKEN=os.environ.get('CLIPFLEET_ADMIN_TOKEN','')
WEBHOOK=os.environ.get('GROKBOT_WEBHOOK_URL','')
KEY=os.environ.get('GROKBOT_WEBHOOK_KEY','')

def valid_webhook(url):
    try: p=urlparse(url)
    except ValueError: return False
    return (p.scheme=='https' and bool(p.hostname) and not p.username and not p.password
            and p.port in (None,443) and p.hostname not in ('localhost','127.0.0.1'))

def call(method,route,payload=None):
    data=json.dumps(payload).encode('utf-8') if payload is not None else None
    req=urllib.request.Request(BASE+route,data=data,method=method,headers={
       'Authorization':'Bearer '+TOKEN,'content-type':'application/json','user-agent':'ClipFleet-GrokBot-Bridge/1.0'})
    with urllib.request.urlopen(req,timeout=18) as resp:
        return json.load(resp)

def send_task(task):
    # Task data is narrowly public: no social login, workflow admin token, brand brief or source footage.
    payload={
      'event':'clipfleet.review_ready.v1',
      'task_id':task['id'],
      'job_id':task['job_id'],
      'campaign_id':task['campaign_id'],
      'campaign_url':task['campaign_url'],
      'render_run_url':task['actions_run_url'],
      'render_sha256':task['output_sha256'],
      'dashboard_url':BASE,
      'instructions_url':'https://github.com/amiddlebrook/Clipfleet/blob/main/docs/GROKBOT-INTEGRATION.md',
      'approval_required_for':['publication','campaign_submission','claims_of_eligibility_or_rights'],
      'no_automatic_payout_claims':True,
    }
    request=urllib.request.Request(WEBHOOK,method='POST',data=json.dumps(payload).encode('utf-8'),
             headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json',
                      'User-Agent':'ClipFleet-GrokBot-Bridge/1.0'})
    try:
        with urllib.request.urlopen(request,timeout=18) as response:
            return int(response.status)
    except urllib.error.HTTPError as error:
        return int(error.code)
    except Exception as error:
        print('Webhook network status uncertain:',type(error).__name__,file=sys.stderr)
        return 0

def main():
    if not WEBHOOK or not KEY:
        print('Grok Bot webhook secrets missing: no bot is triggered. No credentials logged.')
        return 0
    if not BASE.startswith('https://') or not TOKEN or not valid_webhook(WEBHOOK):
        print('Invalid ClipFleet/Grok Bot configuration',file=sys.stderr)
        return 2
    try:
        selected=call('POST','/api/grokbot/claim',{'max':2})['tasks']
    except Exception as error:
        print('Could not claim tasks:',type(error).__name__,file=sys.stderr)
        return 1
    print('Claimed',len(selected),'Grok Bot review tasks (max 2)')
    problems=0
    for task in selected:
        code=send_task(task)
        try:
            response=call('POST','/api/grokbot/dispatch-result',{'task_id':task['id'],'http_status':code})
            if code==200:
                print('Accepted by Grok Bot webhook:',task['id'],'(bot outcome NOT verified)')
            else:
                print('Webhook not accepted:',task['id'],'HTTP',code,file=sys.stderr)
                problems+=1
        except Exception as error:
            print('Unable to record webhook delivery:',task['id'],type(error).__name__,file=sys.stderr)
            problems+=1
        time.sleep(0.2)
    return 1 if problems else 0

if __name__=='__main__':raise SystemExit(main())
