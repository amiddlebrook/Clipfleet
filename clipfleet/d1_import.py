"""Import public campaign metadata into the owner's D1 database using scoped Cloudflare API credentials.

This import has no creator or posting privileges. Data is extracted from public pages,
may be incomplete, and must not be treated as live eligibility or earnings proof.
"""
import datetime as dt
import json
import os
import re
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

DB_NAME = 'clipfleet-ops-db'
CAMPAIGN_UUID = re.compile(r'^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$')


def import_public_campaigns(path: str) -> int:
    account = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '').strip()
    token = os.environ.get('CLOUDFLARE_API_TOKEN', '').strip()
    if not account or not token:
        raise RuntimeError('Cloudflare D1 importer requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN')
    if not re.fullmatch(r'[a-fA-F0-9]{32}', account):
        raise ValueError('Invalid Cloudflare account ID')
    payload = json.loads(Path(path).read_text(encoding='utf-8'))
    campaigns = payload.get('campaigns', [])
    if not isinstance(campaigns, list):
        raise ValueError('Expected campaigns list')

    base = 'https://api.cloudflare.com/client/v4/accounts/' + account + '/d1/database'

    def call(url: str, data=None):
        req = Request(url, headers={'Authorization': 'Bearer ' + token,
                                    'Content-Type': 'application/json',
                                    'User-Agent': 'ClipFleet/0.2 (authorized D1 import)'},
                      data=json.dumps(data).encode('utf-8') if data is not None else None,
                      method='POST' if data is not None else 'GET')
        with urlopen(req, timeout=35) as response:
            result = json.load(response)
        if not result.get('success'):
            raise RuntimeError('Cloudflare API rejected a D1 request: ' +
                               '; '.join(str(x.get('message', 'Unknown')) for x in result.get('errors', []))[:250])
        return result

    if not campaigns:
        print('0 public campaigns found; skipping Cloudflare import')
        return 0
    listing = call(base + '?name=' + quote(DB_NAME) + '&per_page=100')
    records = listing.get('result') or []
    database = next((x for x in records if x.get('name') == DB_NAME), None)
    if not database:
        raise RuntimeError('Cloudflare database clipfleet-ops-db was not found; deploy the Worker first')
    uuid = database.get('uuid') or database.get('id')
    if not uuid or not re.fullmatch(r'[a-fA-F0-9-]{36}', uuid):
        raise RuntimeError('Cloudflare returned an invalid D1 database UUID')

    sql = '''INSERT INTO campaigns(id,url,title,model,rate,budget_remaining,priority_score,accepting,source,discovered_at,last_seen_at,detail_checked_at)
VALUES(?,?,?,?,CAST(NULLIF(?, '') AS REAL),CAST(NULLIF(?, '') AS REAL),CAST(? AS REAL),CAST(? AS INTEGER),?,?,?,?)
ON CONFLICT(id) DO UPDATE SET title=excluded.title,model=excluded.model,rate=excluded.rate,budget_remaining=excluded.budget_remaining,
priority_score=excluded.priority_score,accepting=excluded.accepting,last_seen_at=excluded.last_seen_at,detail_checked_at=excluded.detail_checked_at'''
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
    batch = []
    for c in campaigns[:50]:
        if not isinstance(c, dict):
            continue
        cid = str(c.get('id', '')).lower()
        if not CAMPAIGN_UUID.fullmatch(cid):
            continue
        model = c.get('model') if c.get('model') in ('cpm', 'per_post') else 'unknown'
        def nullable_number(x):
            if isinstance(x, (float, int)) and not isinstance(x, bool) and 0 <= x < 1e12:
                return str(x)
            return ''
        rating = c.get('priority_score', 0)
        rating = float(rating) if isinstance(rating, (float, int)) and 0 <= rating <= 100 else 0
        params = [cid, 'https://contentrewards.com/c/campaigns/' + cid, str(c.get('title') or '')[:180],
                  model, nullable_number(c.get('rate')), nullable_number(c.get('budget_remaining')),
                  str(rating), '1' if c.get('accepting') is True else '0',
                  'public_campaign_detail', now, now, now]
        batch.append({'sql': sql, 'params': params})
    if not batch:
        print('0 valid public campaigns; skipping Cloudflare import')
        return 0
    result = call(base + '/' + uuid + '/query', {'batch': batch})
    items = result.get('result') or []
    if not isinstance(items, list) or len(items) != len(batch) or any(not x.get('success') for x in items):
        raise RuntimeError('Cloudflare D1 import returned incomplete or unsuccessful writes')
    print('Imported', len(batch), 'public campaign metadata records into Cloudflare D1 (not verified creator eligibility)')
    return len(batch)
