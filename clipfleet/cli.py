"""Orchestration entrypoint. No external paid AI services required."""
import argparse
import json
import os
from pathlib import Path
import sys
import tempfile
import urllib.error
import urllib.request
from .engine import SOURCES, retrieve, discover_links, describe_campaign, score, make_video, obtain_licensed_asset, write_json, load_json, timestamp


def worker_call(method: str, route: str, data=None):
    endpoint = os.getenv('CLIPFLEET_WORKER_URL', '').rstrip('/')
    token = os.getenv('CLIPFLEET_ADMIN_TOKEN', '')
    if not endpoint or not token: raise RuntimeError('Set CLIPFLEET_WORKER_URL and CLIPFLEET_ADMIN_TOKEN')
    payload = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(endpoint+route, data=payload, method=method,
             headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','User-Agent':'ClipFleet/0.1'})
    try:
        with urllib.request.urlopen(req,timeout=25) as resp: return json.load(resp)
    except urllib.error.HTTPError as ex:
        raise RuntimeError(f'Worker request failed: {ex.code} {ex.read(500).decode("utf-8","replace")}') from ex


def cmd_discover(args):
    docs=[]
    for url in SOURCES:
        try:
            docs.append(retrieve(url))
            print('Discovered public page:',url)
        except Exception as exc:
            print(f'WARNING: public page unavailable ({url}): {exc}',file=sys.stderr)
    campaigns=[]
    for candidate in discover_links(docs)[:args.max_details]:
        try:
            c=score(describe_campaign(candidate,retrieve(candidate['url'])))
            campaigns.append(c)
        except Exception as exc:
            print(f'WARNING: could not verify {candidate["url"]}: {exc}', file=sys.stderr)
    campaigns.sort(key=lambda c:c['priority_score'],reverse=True)
    write_json(args.output, {'collected_at':timestamp(),'campaigns':campaigns})
    if args.upload and campaigns: print(worker_call('POST','/api/import',{'campaigns':campaigns}))
    print(f'Indexed {len(campaigns)} public opportunities to {args.output}; none is auto-joined')


def cmd_upload(args):
    data=load_json(args.file)
    campaigns=data.get('campaigns',[])
    if campaigns:
        result=worker_call('POST','/api/import',{'campaigns':campaigns[:50]})
        print(json.dumps(result,indent=2))
    else: print('No verified public campaign details to import')


def cmd_import_d1(args):
    from .d1_import import import_public_campaigns
    import_public_campaigns(args.file)


def cmd_render(args):
    job=load_json(args.job)
    if args.variant < 0 or args.variant > 3: raise ValueError('Variant must be 0, 1, 2, or 3')
    output=Path(args.output)
    with tempfile.TemporaryDirectory(prefix='clipfleet-asset-') as folder:
        job=obtain_licensed_asset(job,Path(folder))
        report=make_video(job,output,args.variant)
    write_json(output.with_suffix('.json'),report)
    print(json.dumps(report,indent=2))


def cmd_plan(args):
    print(json.dumps(worker_call('POST','/api/plan',{}),indent=2))


def cmd_worker(args):
    print(json.dumps(worker_call('GET',args.route),indent=2))


def cmd_publish_youtube(args):
    """One-shot deliberate publish step; not used by unattended scheduled Actions."""
    from .youtube import upload_video
    if not args.confirm:
        raise ValueError('Public publishing requires --confirm and user-authorized credentials')
    job=load_json(args.job)
    result=upload_video(args.video,args.title,args.description,job)
    write_json(Path(args.video).with_suffix('.posted.json'),{**result,'published_at':timestamp(),'campaign_url':job.get('campaign_url')})
    print(json.dumps(result,indent=2))
    print('IMPORTANT: The campaign will not track this clip unless you submit it within 30 minutes.')


def cmd_batch(args):
    """Drain preauthorized render queue. Always fails closed for unknown permissions."""
    total=0
    while total<args.max_jobs:
        data=worker_call('POST','/api/jobs/claim',{'worker':'github-actions'})
        job=data.get('job')
        if not job:break
        total+=1
        try:
            config=job['payload'] if isinstance(job['payload'],dict) else json.loads(job['payload'])
            config['campaign_id']=job['campaign_id']
            dst=Path(args.output_dir)/f'{job["id"]}.mp4'
            with tempfile.TemporaryDirectory(prefix='clipfleet-asset-') as folder:
                config=obtain_licensed_asset(config,Path(folder))
                result=make_video(config,dst,config.get('variant',0))
            write_json(dst.with_suffix('.json'),result)
            repo_name=os.getenv('GITHUB_REPOSITORY','')
            run_id=os.getenv('GITHUB_RUN_ID','')
            actions_run_url=(f'https://github.com/{repo_name}/actions/runs/{run_id}'
                              if repo_name=='amiddlebrook/Clipfleet' and run_id.isdecimal() else '')
            worker_call('POST',f'/api/jobs/{job["id"]}/complete',{'status':'ready_for_review','output_sha256':result['sha256'],'actions_run_url':actions_run_url})
            print(f'Rendered {dst}')
        except Exception as exc:
            worker_call('POST',f'/api/jobs/{job["id"]}/complete',{'status':'failed','error':str(exc)[:200]})
            print(f'FAILED job {job["id"]}: {exc}',file=sys.stderr)
    print(f'Processed {total} job(s). No video has been automatically posted or submitted.')


def main(argv=None):
    ap=argparse.ArgumentParser(prog='clipfleet',description='Rights-gated Content Rewards campaign operations')
    sub=ap.add_subparsers(dest='cmd',required=True)
    p=sub.add_parser('discover');p.add_argument('--max-details',type=int,default=30);p.add_argument('--output',default='artifacts/discovered.json');p.add_argument('--upload',action='store_true');p.set_defaults(fn=cmd_discover)
    p=sub.add_parser('upload');p.add_argument('--file',default='artifacts/discovered.json');p.set_defaults(fn=cmd_upload)
    p=sub.add_parser('import-d1');p.add_argument('--file',default='artifacts/discovered.json');p.set_defaults(fn=cmd_import_d1)
    p=sub.add_parser('render');p.add_argument('--job',required=True);p.add_argument('--output',default='artifacts/clip.mp4');p.add_argument('--variant',type=int,default=0);p.set_defaults(fn=cmd_render)
    p=sub.add_parser('plan');p.set_defaults(fn=cmd_plan)
    p=sub.add_parser('worker');p.add_argument('route',nargs='?',default='/api/campaigns');p.set_defaults(fn=cmd_worker)
    p=sub.add_parser('batch');p.add_argument('--max-jobs',type=int,default=2);p.add_argument('--output-dir',default='artifacts');p.set_defaults(fn=cmd_batch)
    p=sub.add_parser('publish-youtube');p.add_argument('--job',required=True);p.add_argument('--video',required=True);p.add_argument('--title',required=True);p.add_argument('--description',required=True);p.add_argument('--confirm',action='store_true');p.set_defaults(fn=cmd_publish_youtube)
    args=ap.parse_args(argv)
    try:args.fn(args)
    except Exception as exc:
        print(f'ERROR: {exc}',file=sys.stderr);return 1
    return 0

if __name__=='__main__':raise SystemExit(main())
