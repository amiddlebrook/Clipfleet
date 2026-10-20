"""Discovery, scoring, production and audit. Python standard library only.

This is deliberately NOT a browser-login automation system. The final Content Rewards
submission is manual unless a documented, explicitly authorized API is configured.
"""
from __future__ import annotations
import datetime as dt
import hashlib
import html
import json
import os
from pathlib import Path
import re
import shutil
import ipaddress
import tempfile
from urllib.parse import urlparse
import subprocess
import textwrap
import urllib.request
from typing import Any

UUID = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
CAMPAIGN_RE = re.compile(r'(?:https?://(?:www\.)?contentrewards\.com)?/c/campaigns/(' + UUID + r')', re.I)
SOURCES = ('https://contentrewards.com/c/discover', 'https://whop.com/contentrewards/')
UA = 'ClipFleet/0.1 (public pages only; respect robots/rate limits; contact: repo owner)'


def timestamp() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


def retrieve(url: str, max_bytes: int = 3_000_000, timeout: int = 15) -> str:
    """Read only public, named source hosts; don't obtain cookies or bypass access checks."""
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname not in {'contentrewards.com', 'whop.com'}:
        raise ValueError('Only documented public announcement hosts are permitted')
    request = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html'})
    with urllib.request.urlopen(request, timeout=timeout) as resp:
        if resp.status != 200 or resp.url and urlparse(resp.url).hostname not in {'contentrewards.com', 'whop.com'}:
            raise ValueError('Unexpected public page response or redirect')
        content = resp.read(max_bytes + 1)
        if len(content) > max_bytes:
            raise ValueError('Page exceeds fetch limit')
        return content.decode('utf-8', 'replace')


def discover_links(pages: list[str]) -> list[dict[str, str]]:
    seen: dict[str, dict[str, str]] = {}
    for source in pages:
        # Next.js/RSC pages escape slashes within JSON and HTML entities.
        cleaned = html.unescape(source).replace('\\u002F', '/').replace('\\/', '/')
        for match in CAMPAIGN_RE.finditer(cleaned):
            cid = match.group(1).lower()
            seen[cid] = {'id': cid, 'url': f'https://contentrewards.com/c/campaigns/{cid}'}
    return list(seen.values())


def visible_text(document: str) -> str:
    document = re.sub(r'<(script|style)\b[^>]*>.*?</\1>', ' ', document, flags=re.I | re.S)
    document = re.sub(r'<[^>]+>', ' ', document)
    return ' '.join(html.unescape(document).split())


def describe_campaign(candidate: dict[str, str], document: str) -> dict[str, Any]:
    text = visible_text(document)
    title = re.search(r'<h1[^>]*>(.*?)</h1>', document, re.I | re.S)
    name = visible_text(title.group(1)) if title else 'Unverified campaign'
    # Amounts may be missing or re-ordered; absent values are not invented.
    per_post = re.search(r'Per approved post\s*\$([\d,.]+)', text, re.I)
    cpm = re.search(r'\$([\d,.]+)\s*(?:per 1,000 views|/\s*1K)', text, re.I)
    remaining = re.search(r'\$([\d,.]+)\s+remaining', text, re.I)
    active = bool(re.search(r'Accepting clips', text, re.I)) and not bool(re.search(r'\bCampaign paused\b', text, re.I))
    amount = per_post or cpm
    return {**candidate, 'title': name[:180], 'model': 'per_post' if per_post else ('cpm' if cpm else 'unknown'),
        'rate': float(amount.group(1).replace(',', '')) if amount else None,
        'budget_remaining': float(remaining.group(1).replace(',', '')) if remaining else None,
        'accepting': active, 'observed_at': timestamp(), 'brief_excerpt': text[:1200],
        'verified_eligibility': False, 'assets_licensed': False}


def score(c: dict[str, Any]) -> dict[str, Any]:
    """Heuristic only. Never represent this as a measured approval/profit probability."""
    budget = c.get('budget_remaining')
    rate = c.get('rate')
    eligible = c.get('verified_eligibility', False)
    active = c.get('accepting', False)
    if not active or not isinstance(budget, (float, int)) or budget < 20 or not rate:
        s = 0.0
    else:
        s = (45 if c.get('model') == 'per_post' else 18) + min(25, float(budget) / 200) + min(25, float(rate) * (2 if c.get('model') == 'per_post' else 3))
        if eligible: s += 5
        if not c.get('assets_licensed', False): s *= .5
    return {**c, 'priority_score': round(min(100, s), 2), 'score_type': 'heuristic_not_probability'}


def make_script(job: dict[str, Any], variant: int) -> list[str]:
    """Template-based creative agent, no hallucinated product performance claims."""
    title = job.get('product_name') or job.get('campaign_title') or 'Featured project'
    benefit = job.get('approved_value_prop') or 'See the official product details'
    action = job.get('approved_cta') or 'Learn more from the official campaign'
    hooks = [f'What makes {title} interesting?', f'A quick look at {title}', f'Here is one thing to know about {title}']
    return [('DEMO ONLY - NOT A CAMPAIGN' if job.get('demo_only') else 'Paid promotion'), hooks[variant % len(hooks)], benefit[:130], action[:130]]


def obtain_licensed_asset(job: dict[str, Any], scratch: Path) -> dict[str, Any]:
    """Resolve an explicitly authorized public MP4 from approved hosts; no cookie scraping."""
    if job.get('source_video') or not job.get('source_video_url'):
        return job
    if not (job.get('assets_licensed') and job.get('rights_evidence')):
        raise ValueError('No rights evidence for remote brand asset')
    url = str(job['source_video_url'])
    parsed = urlparse(url)
    allow = {x.strip().lower() for x in os.getenv('CLIPFLEET_ASSET_HOSTS','').split(',') if x.strip()}
    if parsed.scheme != 'https' or not parsed.hostname or parsed.hostname.lower() not in allow:
        raise ValueError('Brand asset host must be explicitly allowed in CLIPFLEET_ASSET_HOSTS')
    if parsed.username or parsed.password or parsed.port not in (None,443):
        raise ValueError('Asset URL must be an ordinary HTTPS link')
    try:
        ipaddress.ip_address(parsed.hostname)
    except ValueError:
        pass
    else:
        raise ValueError('IP addresses are not allowed as video download hosts')
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*_args,**_kwargs):
            raise ValueError('Redirected media is not accepted; use the final authorized HTTPS media URL')
    opener=urllib.request.build_opener(NoRedirect)
    request=urllib.request.Request(url,headers={'User-Agent': UA,'Accept':'video/mp4'})
    scratch.mkdir(parents=True,exist_ok=True)
    dest=scratch/'licensed-asset.mp4'
    with opener.open(request,timeout=30) as resp:
        mime=resp.headers.get('Content-Type','').split(';')[0].lower()
        if mime not in ('video/mp4','video/quicktime','application/octet-stream'):
            raise ValueError(f'Unexpected asset MIME type: {mime}')
        n=0
        with dest.open('wb') as handle:
            while True:
                chunk=resp.read(1024*1024)
                if not chunk:break
                n+=len(chunk)
                if n>150_000_000:raise ValueError('Licensed asset exceeds 150 MB')
                handle.write(chunk)
    if dest.stat().st_size<1024:raise ValueError('Asset video too small')
    return {**job,'source_video':str(dest)}


def ffmpeg_exists() -> bool:
    return bool(shutil.which('ffmpeg') and shutil.which('ffprobe'))


def seconds(path: Path) -> float:
    proc = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(path)], capture_output=True, text=True, check=True)
    return float(proc.stdout.strip())


def make_video(job: dict[str, Any], output: Path, variant: int = 0) -> dict[str, Any]:
    if not ffmpeg_exists():
        raise RuntimeError('ffmpeg and ffprobe are required for rendering')
    if not job.get('verified_eligibility') or not job.get('assets_licensed'):
        raise ValueError('A real campaign must have verified eligibility and confirmed content rights before rendering')
    if job.get('requires_preapproval') and not job.get('draft_approved'):
        raise ValueError('Campaign requires draft pre-approval before publishing')
    if not job.get('allows_original_graphic') and not job.get('source_video'):
        raise ValueError('Campaign does not authorize text-only original graphics; licensed footage is required')
    duration = max(15, min(45, int(job.get('duration_seconds', 25))))
    output.parent.mkdir(parents=True, exist_ok=True)
    lines = make_script(job, variant)
    frame_t = duration / len(lines)
    color = ['0x122b3c', '0x19434a', '0x303a52'][variant % 3]
    font = next((p for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf'] if Path(p).exists()), None)
    if not font: raise RuntimeError('Install DejaVu Sans (Linux) or specify a system font')
    # Avoid ffmpeg string interpolation for user text: use UTF-8 text files with drawtext textfile.
    overlay_dir = output.parent / (output.stem + '_text')
    overlay_dir.mkdir(parents=True, exist_ok=True)
    filters = []
    for i, line in enumerate(lines):
        text_file = overlay_dir / f'line{i}.txt'
        text_file.write_text('\n'.join(textwrap.wrap(line, width=23, break_long_words=False)), encoding='utf-8')
        start = i * frame_t
        end = (i+1)*frame_t
        escaped_path = str(text_file.resolve()).replace('\\', '/').replace(':', r'\:').replace("'", r"\'")
        escaped_font = font.replace('\\', '/').replace(':', r'\:')
        filters.append(f"drawtext=fontfile='{escaped_font}':textfile='{escaped_path}':fontcolor=white:fontsize=55:line_spacing=12:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,{start:.2f},{end:.2f})':box=1:boxcolor=black@0.38:boxborderw=20")
    if job.get('source_video'):
        source = Path(job['source_video'])
        if not source.is_file(): raise FileNotFoundError(f'Missing licensed footage: {source}')
        scale = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'
        inputs = ['-stream_loop', '-1', '-i', str(source)]
        filt = ','.join([scale] + filters)
        audio_args = ['-map','0:v:0','-map','0:a?','-c:a','aac','-b:a','128k']
    else:
        if not job.get('allows_original_graphic'):
            raise ValueError('Missing authorized footage')
        inputs = ['-f','lavfi','-i',f'color=c={color}:s=1080x1920:r=30:d={duration}']
        filt = ','.join(filters)
        audio_args = ['-an']
    cmd = ['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-t',str(duration),'-vf',filt,*audio_args,'-c:v','libx264','-preset','veryfast','-crf','24','-pix_fmt','yuv420p','-movflags','+faststart',str(output)]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=240)
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f'FFmpeg rendering failed: {exc.stderr[-1200:]}') from exc
    finally:
        shutil.rmtree(overlay_dir, ignore_errors=True)
    sec = seconds(output)
    if not 14.5 <= sec <= 45.5:
        raise RuntimeError(f'QA failed: unexpected duration {sec}')
    fingerprint = hashlib.sha256(output.read_bytes()).hexdigest()
    return {'path': str(output), 'duration_seconds': round(sec,2), 'sha256':fingerprint,
            'resolution':'1080x1920','caption': (job.get('required_caption','') if job.get('demo_only') else (job.get('required_caption','') + '\nPaid promotion')),
            'disclosure_in_video': not bool(job.get('demo_only')), 'demo_only':bool(job.get('demo_only')), 'campaign_id': job['campaign_id'], 'campaign_url': job.get('campaign_url'),
            'published_url':None, 'submission_status':'not_submitted'}


def load_json(path: str | Path) -> Any:
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write_json(path: str | Path, value: Any) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n',encoding='utf-8')
