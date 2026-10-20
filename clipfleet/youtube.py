"""Optional first-party YouTube Data API upload.

Video upload alone NEVER equals Content Rewards submission, which must occur within
30 minutes through its separate platform. Requires previously authorized OAuth.
"""
import json
import os
from pathlib import Path
from urllib.parse import urlencode, urlparse
import urllib.request


def upload_video(file: str | Path, title: str, description: str, job: dict) -> dict:
    if job.get('demo_only'):
        raise ValueError('Demo videos cannot be uploaded as sponsored campaign submissions')
    if not job.get('verified_eligibility') or not job.get('assets_licensed') or not job.get('brief_reviewed'):
        raise ValueError('Cannot upload without documented campaign eligibility, approved brief, and content rights')
    if 'youtube' not in [x.lower() for x in job.get('allowed_platforms', [])]:
        raise ValueError('Campaign profile does not authorize YouTube')
    if job.get('requires_preapproval') and not job.get('draft_approved'):
        raise ValueError('Brand preapproval is required before posting')
    required = ['YOUTUBE_CLIENT_ID','YOUTUBE_CLIENT_SECRET','YOUTUBE_REFRESH_TOKEN']
    if any(not os.getenv(x) for x in required):
        raise RuntimeError('Missing user-granted YouTube OAuth environment credentials')
    f=Path(file)
    size=f.stat().st_size
    if size < 1000 or size > 150_000_000: raise ValueError('Video file size must be 1 KB to 150 MB')
    creds=urlencode({'client_id':os.environ['YOUTUBE_CLIENT_ID'], 'client_secret':os.environ['YOUTUBE_CLIENT_SECRET'],
      'refresh_token':os.environ['YOUTUBE_REFRESH_TOKEN'],'grant_type':'refresh_token'}).encode()
    token_request=urllib.request.Request('https://oauth2.googleapis.com/token',data=creds,method='POST',headers={'Content-Type':'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(token_request,timeout=30) as resp: token=json.load(resp)['access_token']
    meta={'snippet':{'title':title[:100], 'description':('Paid promotion / #ad\n'+description)[:4500], 'categoryId':'22'},
      'status':{'privacyStatus':'public','selfDeclaredMadeForKids':False, 'containsSyntheticMedia':bool(job.get('contains_synthetic_media',False))}}
    encoded=json.dumps(meta).encode('utf-8')
    url='https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status'
    req=urllib.request.Request(url,data=encoded,method='POST',headers={
      'Authorization':'Bearer '+token,'Content-Type':'application/json; charset=UTF-8',
      'X-Upload-Content-Length':str(size),'X-Upload-Content-Type':'video/mp4'})
    with urllib.request.urlopen(req,timeout=30) as resp: location=resp.headers.get('Location')
    if not location or urlparse(location).hostname not in {'www.googleapis.com','googleapis.com'} or not location.startswith('https://'):
        raise RuntimeError('Google did not provide a trusted resumable upload session')
    payload=f.read_bytes()
    req=urllib.request.Request(location,data=payload,method='PUT',headers={'Authorization':'Bearer '+token,'Content-Type':'video/mp4'})
    with urllib.request.urlopen(req,timeout=120) as resp: result=json.load(resp)
    video_id=result.get('id')
    if not video_id or not isinstance(video_id,str): raise RuntimeError('YouTube did not return a video ID; verify status manually')
    privacy=result.get('status',{}).get('privacyStatus','unknown')
    if privacy!='public':
        raise RuntimeError(f'YouTube returned a non-public upload ({privacy}); not eligible for Content Rewards submission')
    return {'post_url':f'https://www.youtube.com/watch?v={video_id}', 'video_id':video_id,
      'published_public':True, 'contentrewards_submitted':False,
      'NEXT_ACTION':'Submit new post URL to Content Rewards within 30 minutes; video posting does not submit it automatically.'}
