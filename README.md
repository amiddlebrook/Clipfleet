<div align="center">

# ClipFleet

### Campaign discovery → eligibility gating → creative production → QA → publishing handoff

**A zero-mandatory-cost, Cloudflare-native production pipeline for Content Rewards clipping campaigns.**

Cloudflare Workers + D1 · GitHub Actions · FFmpeg · Python 3.11+ · no paid AI API needed

</div>

> **Important truth:** This project is not capable of unattended **end-to-end paid submissions** to Content Rewards today. I could verify the platform's official workflow (connect/verify social accounts, join campaigns, post, submit within **30 minutes**), but could not verify a public, officially supported API for completing those submissions. The software therefore **never claims a clip was submitted or earned money**. It does automate campaign research, scoring, rights-gated creative production and review packaging at scale. If the sponsor authorizes an HTTPS media link, the runner can fetch footage from explicitly allowlisted domains; it cannot infer usage rights from a URL. Optional official YouTube uploading exists for deliberate on-demand use. Do **not** automate posting unless you can submit the post immediately afterward through a legitimate authorized mechanism. No bot-generated views, fake engagement, CAPTCHA bypass, cookie scraping or platform impersonation.


## Dashboard upgrades: filters, AI briefs and creator presets

Open **https://clipfleet-ops.averymiddlebrook2014.workers.dev** and connect your administrator token.

**Campaign filters:** Search by brand/UUID, payment model (per-approved-post vs CPM), accepting status, whether the public detail was checked within 12 hours, and minimum remaining budget. Sort by priority score, latest verification, highest remaining budget, or rate (rates are grouped by payment model because CPM and per-post payouts are not directly comparable). These filters work in the browser on indexed campaigns; they do not imply real-time eligibility.

**AI draft from official brief:** Select a campaign and paste at least 80 characters of its official campaign brief into the **AI-assisted campaign draft** panel. Press **AI draft from official brief**. Cloudflare Workers AI (model `@cf/meta/llama-3.1-8b-instruct-fp8`) returns *editable draft suggestions* for brand/product name, value proposition, call to action and caption. The AI request is authenticated, the brief is not added to the campaign database, and the Worker caps drafting at **8 requests per UTC day** to prioritize free-tier usage. The free Workers plan has a shared daily Workers AI allowance, so generation may fail if that allowance is exhausted. You can always enter text manually. The button **Prefill title only** uses deterministic public listing metadata, not AI.

**Social presets:** Use **Social account presets** to save a platform and handle (YouTube, TikTok, Instagram, Facebook or X), provided you have *already connected it in Content Rewards* and checked that it shows Connected. Saved entries are private D1 records available through administrator endpoints; no passwords or OAuth tokens are stored. **Use preset** inserts the platform into the campaign form, but you must separately confirm that the campaign accepts that platform. Presets are not a way to connect Content Rewards OAuth or automate social uploading.

**Review gate:** The AI does not fill rights evidence, content license, account-connection truth, media permission, or brand pre-approval. Those are confirmed manually. Check eligibility and the complete sponsor brief before authorizing jobs. If brand draft pre-approval is required, mark **Brand requires draft pre-approval**, and only mark **Brand approved my actual draft** once it really has.

For account verification, [follow the official Content Rewards guide](https://help.contentrewards.com/en/articles/16746780-connect-your-social-accounts). Linking an account in Whop itself is not sufficient.

**No change to publishing:** ClipFleet's scheduled pipeline still prepares video artifacts for review, not unattended Content Rewards submissions, and nothing here guarantees earnings.

## What runs on a schedule

| Component | Action | Automation |
| --- | --- | --- |
| **Scout** | Read *public* official Discover and Whop Content Rewards announcement pages every 6 hours; index public campaign links | ✅ Cloudflare cron + GitHub Actions |
| **Analyst** | Inspect accessible campaign detail pages, estimate remaining budget / per-post vs CPM rate, rank candidates | ✅ GitHub Actions |
| **Eligibility guard** | Require joined/approved campaign, verified social account, rights clearance, reviewed brief, approved creative format | 🔐 One-time human attestation per campaign |
| **Planner** | Queue up to 3 distinct hook variants per approved campaign and up to 6 jobs/day total | ✅ Cloudflare D1 cron/API |
| **Creative** | Render 1080×1920 short clips from rights-cleared footage or explicitly permitted original graphic formats | ✅ FFmpeg on GitHub Actions |
| **QA** | Require video duration 15–45 seconds, include paid-promotion disclosure, produce caption and SHA-256 audit | ✅ Python |
| **Publisher** | Upload from an authorized YouTube account using official OAuth with a deliberate CLI command | ⚙️ Only when configured and triggered |
| **Submitter** | Submit new social post URL to Content Rewards campaign within 30 minutes | **Manual until an authorized supported integration exists** |
| **Ledger** | Record discovery, render queue and failures in D1; downloadable render packages in GitHub Actions | ✅ |

### Why not automatically submit with browser bots?

New Content Rewards submissions require a joined campaign, verified connected account, a new post younger than 30 minutes, and campaign-specific eligibility. Automating account logins or undocumented submission endpoints with harvested cookies would be brittle and may expose the account or violate platform rules. The official public Whop developer API for an app is **not equivalent** to an authorized Content Rewards creator submission API.

## Run it now — local demo

```powershell
# In Windows PowerShell, after extracting the zip:
cd ClipFleet
py -m unittest discover -s tests -v
py -m clipfleet discover --max-details 25 --output artifacts/discovered.json
```

The last command reads publicly accessible listing pages. It never accesses a private Whop account. The live results can be empty or partial if upstream public pages restrict programmatic reads. This is a discovery **feed**, not an availability guarantee.

**Render one approved campaign:**

1. Copy `config.example.json` to `my-campaign.json`.
2. Join/qualify for a real campaign at https://contentrewards.com/c/discover and connect a real social account.
3. Read **all** published campaign requirements; get express permission for the intended brand footage or original-graphics format. Set `verified_eligibility`, `assets_licensed`, and `brief_reviewed` to true *only after verifying them*. Put the evidence/source in `rights_evidence`. Replace all example brand claims with supported text. If brand pre-approval is required, set `requires_preapproval=true` and supply only approved content after `draft_approved=true`.
4. For brand footage, place the authorized video inside `assets/`, set `source_video` to its path, and set `allows_original_graphic=false`. For **unattended cloud renders**, instead use a direct brand-authorized HTTPS MP4 link in `source_video_url`, leave `source_video` empty, and set GitHub repository variable `CLIPFLEET_ASSET_HOSTS` to an explicit comma-separated allowlist of the asset hostnames. The runner downloads that licensed MP4 into a temporary directory with a 150 MB limit and no redirects. For explicitly authorized original text-only graphics, set `source_video` to an empty string and `allows_original_graphic=true`. No arbitrary creator footage is downloaded automatically.
5. Ensure `ffmpeg` + `ffprobe` are installed, then:

```powershell
py -m clipfleet render --job my-campaign.json --variant 0 --output artifacts/clip.mp4
```

A companion `artifacts/clip.json` contains the campaign URL, caption, render fingerprint, and `submission_status: not_submitted`.

### Zero-cost cloud deployment

**Prerequisites:** Free GitHub account, free Cloudflare account, Node 22+, Python 3.11+, `gh` CLI, `git` and `npx`.

1. Create your own public GitHub repository (e.g. `amiddlebrook/ClipFleet`) and push the contents of this archive. **Do not add it to RivetFlow.** If you have GitHub CLI authorized, PowerShell setup is:

```powershell
# Run from the ClipFleet extracted directory
.\Setup-ClipFleet.ps1 -Repository amiddlebrook/ClipFleet
```

2. Add repository secrets: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and ideally a new random `CLIPFLEET_ADMIN_TOKEN` (32+ characters) **in the ClipFleet repo**, not another app's secrets. In Cloudflare, create a scoped token with Worker and D1 permissions. Do not expose these values in Git or this chat.
3. Run GitHub Actions **Deploy Cloudflare Worker** once. It creates D1, applies the migration, deploys the Worker and securely sets `ADMIN_TOKEN` from your secret. Verify `https://clipfleet-ops.<your-subdomain>.workers.dev/api/health` returns `ok:true`.
4. The pipeline automatically discovers the `CLIPFLEET_WORKER_URL` using your Cloudflare account ID and API token. You may override it with the repository variable of that name. If `CLIPFLEET_ADMIN_TOKEN` is missing, deployment generates a random unshared admin credential; the public dashboard and cron discovery work, but private admin operations and job imports cannot be used until you add your admin secret and redeploy.
5. Visit your new Worker homepage to view the public campaign index. For administrative controls, paste your **administrator token in the browser** (kept in memory, not localStorage); click **Connect dashboard** and **Scan public directory**. The dashboard lists campaign links, model, rate, remaining budget and render jobs.
6. The **ClipFleet Pipeline** Actions workflow runs every six hours, imports public campaign details directly into D1 using Cloudflare API credentials, plans jobs for *previously approved campaigns*, and renders at most two videos/run. Upload artifacts include the MP4 and manifest. Nothing is auto-posted or auto-submitted.

**No repo available?** Keep using the local CLI and zip. The archive is a complete standalone project with tests, migrations, Worker, dashboard, scheduled jobs, and a demo config.

### Approving a campaign once

In the Cloudflare dashboard, choose a discovered campaign and fill out the approval form. Check all three attestations **only when true**. You can also use the authenticated API:

```powershell
$headers = @{ Authorization = "Bearer $env:CLIPFLEET_ADMIN_TOKEN"; 'Content-Type' = 'application/json' }
Invoke-RestMethod -Uri "$env:CLIPFLEET_WORKER_URL/api/profiles" -Method POST -Headers $headers -InFile my-campaign.json
Invoke-RestMethod -Uri "$env:CLIPFLEET_WORKER_URL/api/plan" -Method POST -Headers $headers -Body '{}'
```

When authorized, the planner generates up to three unique hook variants per campaign, with a daily global limit of six queued videos. These are operational guardrails to avoid wasting quotas and generating identical content. It is **not** a guaranteed strategy for views or payouts. **Cloudflare D1 stores the profile/permissions**, not secret accounts. You can view the job queue at `GET /api/jobs` with admin authorization.

### Optional official YouTube upload

This is deliberately separate from unattended scheduled Actions because **you need to immediately submit the resulting public post URL to Content Rewards within 30 minutes** (unless you obtain an authorized submission API). To use it, first create Google OAuth credentials and grant `youtube.upload` to your own channel. Set `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` as environment variables **outside the repository**; edit the campaign profile to include `"allowed_platforms": ["youtube"]` and confirm it actually accepts YouTube uploads. Then:

```powershell
py -m clipfleet publish-youtube --job my-campaign.json --video artifacts/clip.mp4 --title "Brand — quick overview #Shorts" --description "#ad Official campaign promotion" --confirm
```

The command checks rights and permissions before using the [official YouTube Data API resumable upload](https://developers.google.com/youtube/data/guides/using_resumable_upload_protocol), returns the real video URL only if YouTube confirms the video is public, and writes `clip.posted.json`. **It does not submit that URL to Content Rewards.** Some YouTube projects/accounts restrict public visibility or enforce upload limits; verify status and ownership before submitting.

### Submission step (critical)

1. Confirm Content Rewards has your **same posting account** connected and verified **inside Content Rewards**, not merely in Whop.
2. If a campaign requires drafts, upload the draft and obtain brand approval **before public posting**.
3. Post a compliant original/authorized video to an allowed platform.
4. **Within 30 minutes of posting**, open the matched campaign page, choose *Submit clip* and enter the public post URL. A video upload on social media is **not** an eligible submission by itself.
5. Check the Content Rewards **Submissions** page for acceptance/rejection; do not count a clip as revenue until validated/settled.

References: [Content Rewards creator terms](https://contentrewards.com/terms), [Find campaigns](https://help.contentrewards.com/en/articles/16817237-find-and-apply-to-a-campaign), [Submit a video](https://help.contentrewards.com/en/articles/15319814-submit-a-video), [YouTube upload API](https://developers.google.com/youtube/data/reference/rest/v3/videos/insert).

### Costs and scale

The backend uses Cloudflare Workers and D1 free-tier allocations and GitHub Actions. This has **no mandatory subscription**, but quota limits and account availability apply. YouTube OAuth, GitHub auth and Content Rewards social-account verification are mandatory for corresponding features. Public repos' GitHub Actions quotas differ from private repos. Optional AI is not necessary and this implementation does not buy video generation credits or proxy services.

The initial conservative upper bound is **six render jobs/day**, **three variants per reviewed campaign**, **two renders per Actions run**, and **seven-day artifact retention**. These are capacity limits, not an income forecast. Scoring favors per-post payouts and remaining budgets but is **not** a measured profit probability. Rejections, minimum views, post eligibility, fees, and campaign exhaustion can reduce returns to zero.

### Project structure

```text
clipfleet/                 Python campaign discovery, heuristic ranking, rendering, optional YouTube publishing
worker/index.js            Cloudflare Worker API, scheduled source discovery and approval-gated D1 work planner
public/                    Responsive command center UI, with transient browser-only token handling
migrations/                Durable D1 campaign, profile and render-job tables
.github/workflows/         GitHub CI, scheduled bounded pipeline, Cloudflare Workers deploy
config.example.json        Never live until explicitly reviewed and rights-cleared
tests/                     Python and JS tests, including a real FFmpeg render
Setup-ClipFleet.ps1         Optional zero-cost GitHub repository setup
```

**Security:** Authenticate the `/api/*` endpoints with a randomly generated bearer token stored as a Cloudflare Worker secret. Do not publish video assets or confidential campaign briefs in a public GitHub repository. Use authorized, public, non-sensitive brand media and verify licensing; store private assets only in authorized private storage when required. Repository ZIPs and Action artifacts may expose material to people who can access the repository. The demo is not penetration-tested or enterprise certified.


**Live discovery without an admin token:** A scheduled GitHub pipeline fetches publicly accessible campaigns and imports their ranking data to D1 using the already-configured scoped Cloudflare API credentials. Read-only dashboard browsing is public. Production approval, claim, and rendering still require a separate `CLIPFLEET_ADMIN_TOKEN` GitHub secret, genuine eligibility, and licensed footage. Public campaign information is neither verified creator eligibility nor a guarantee of available sponsor budget.
