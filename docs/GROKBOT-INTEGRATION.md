# Grok Bot integration — ClipFleet

**Status:** Integrated webhook producer and D1 delivery ledger. Requires *your* Grok Bot webhook routine and secret configuration to become live. A 200 response means the routine started; it is not proof of completion, publishing, submission, or payment.

**Product documentation:** https://prod.cursor.com/help/grok-bot/routines

## Multi-platform handoffs

ClipFleet now creates **one unique render job and one Bot handoff per activated network** in the [four-platform distribution matrix](MULTI-PLATFORM.md). Each webhook also carries `target_platform` (one of `youtube`, `tiktok`, `instagram`, `x`) and `publishing_handle` (a publicly saved creator handle). Treat these as routing hints, **not proof** that the creator account is connected or authorized; recheck inside Content Rewards.

In the Bot routine, use only the target platform/account from that individual job. Never post a YouTube-targeted clip on TikTok just because both accounts exist, never submit the same rendered job twice, and never assume the campaign pays separately on all four networks. Each posting attempt must respect the brief and obtain approval as required. ClipFleet keeps separate per-platform publication, submission, and outcome records.

## What ClipFleet handles

1. A previously authorized ClipFleet job reaches `ready_for_review`, with an exact GitHub Actions artifact-run link.
2. The Cloudflare Worker inserts one `bot_tasks` record per job (never a duplicate).
3. GitHub Actions **Dispatch Grok Bot review tasks** checks for queued tasks every 30 minutes and allows a manual run. If both webhook secrets exist, it claims **no more than two** tasks, sends one authenticated JSON POST per task, and records the webhook HTTP status in D1.
4. The webhook payload includes the task ID, public campaign URL, source job ID, render-run URL, video fingerprint, dashboard URL and approval rules. It NEVER includes the ClipFleet admin token, platform login, paid service credentials, private creative brief, or video files.
5. Grok Bot uses its own authorized cloud browser/connected apps to inspect the selected campaign, locate the specific rendered MP4, review creative compliance, prepare draft upload workflows, and report blockers/approval requests.
6. ClipFleet's dashboard displays `queued`, `dispatching`, `accepted` (webhook started), `reported`, `blocked`, or `failed`. **Accepted does not mean complete.** Bot reports do not automatically mark campaign publication, Content Rewards submission or payout.
7. Optional narrowly scoped callback `POST /api/grokbot/report` with its own token lets the Bot write a *single* unverified action report to that task, without gaining dashboard admin access.

## Required account setup

Grok Bot needs access through an eligible Cursor or linked SuperGrok subscription. **This is not a free mandatory component**; ClipFleet still works without it.

### Step A — Create the Bot and webhook routine

Open the official Grok Bot app on **desktop** (Windows/macOS/Linux). Create a Bot named **ClipFleet Browser Operator**. Give it the instructions below in its chat and ask it to save them as a reusable skill. Then ask:

> Create a webhook-triggered routine called "ClipFleet video review" that runs the ClipFleet Browser Operator skill once for each incoming JSON payload. Never automatically publish or submit without explicit user approval. Always report what happened and what needs my attention.

Open the Bot's **Routines** detail panel on desktop. Copy the routine's `POST to` URL and its separate `key`. The Grok Bot routine documentation specifies `Authorization: Bearer <key>` for webhook calls. **Do not use the Standard Webhooks HMAC signature format from the separate Grok Automations API; this integration targets Grok Bot Routines specifically.**

> As of October 2026, webhook URL/key visibility can be missing in some mobile Grok Bot clients. Use desktop Routines; if necessary open the routine chip in the chat that created it. Do not give the URL or key to ChatGPT.

### Step B — Configure repository Secrets, not repository Variables

In https://github.com/amiddlebrook/Clipfleet/settings/secrets/actions add:

- `GROKBOT_WEBHOOK_URL`: the routine's exact **POST to** URL.
- `GROKBOT_WEBHOOK_KEY`: the routine's webhook **key**, not your xAI API key or your ClipFleet dashboard token.
- Optional `GROKBOT_CALLBACK_TOKEN`: a separate randomly generated token of 32+ characters if you want bot reports to return directly to the ClipFleet UI. Generate on your own Windows PowerShell with:
  `([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N"))`
  Save it as a GitHub Actions **secret** and redeploy Cloudflare. The Bot must also receive this value via an approved private credential handoff or secure configuration on its cloud computer. **Never put it in the webhook JSON body, public GitHub files, browser localStorage, a comment, or this chat.**

The already-configured `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLIPFLEET_ADMIN_TOKEN` remain unchanged. The Bot must **not** receive the dashboard admin token.

### Step C — Redeploy and test with one existing approved render

1. In GitHub Actions open [Deploy Cloudflare Worker](https://github.com/amiddlebrook/Clipfleet/actions/workflows/deploy.yml) and select **Run workflow**. This installs the optional scoped callback secret and applies database migrations.
2. Open [ClipFleet](https://clipfleet-ops.averymiddlebrook2014.workers.dev), reconnect admin, and inspect **Grok Bot — Browser agent task queue**.
3. If a previously rendered, unsubmitted job has a GitHub Actions artifact link and shows **Queue for bot review**, click it. New approved renders queue automatically.
4. Open [Dispatch Grok Bot review tasks](https://github.com/amiddlebrook/Clipfleet/actions/workflows/grokbot-dispatch.yml) and manually run it. With valid webhook secrets a task should move from `queued` to `accepted` (HTTP 200). If no webhook secrets exist, it logs a skip without claiming any task.
5. Open the Grok Bot's chat and watch the run. Test with a clip that is **not** published; verify it **asks for approval** rather than posting or submitting.
6. In ClipFleet click **Refresh bot activity**. Unless you configured the optional callback, the Bot's chat is the source for final status after webhook acceptance.
7. Review one full cycle before relying on the scheduled 30-minute dispatcher. Actions schedules can be delayed; they are unsuitable as a guarantee of a 30-minute post-submission window.

## Grok Bot skill instructions (copy into your own Bot)

> You are ClipFleet Browser Operator. On a webhook containing `event: clipfleet.review_ready.v1`, process **one** task and do not act on a different campaign or video. Confirm the JSON includes `task_id`, `job_id`, `campaign_id`, `campaign_url`, and `render_run_url`. Refuse unknown or incomplete payloads.
>
> Use the campaign URL to inspect the live official Content Rewards brief and confirm the campaign still accepts clips, the selected social account actually qualifies, assets are permitted, platform rules are satisfied, and any pre-approval requirement is met. Do **not** assume eligibility or licensing from ClipFleet's score or user-entered attestations. If access is blocked or uncertain, pause and ask me.
>
> Using your signed-in GitHub browser, open the exact `render_run_url`, download the corresponding authorized artifact, and watch the actual finished MP4. Review required length, format, crop, text claims, caption, platform, disclosure, and originality. If the file is missing, inaccessible, reused, or fails a requirement, mark as blocked and explain; do not swap in a different video.
>
> You may draft a social post, prepare an upload interface, and gather submission instructions through authorized website interfaces. **Do not click Publish/Post, submit a campaign claim, send messages, make purchases, change credentials, bypass verification/CAPTCHA, or create artificial views unless I expressly approve that specific action and it is allowed by the site.** If allowed and explicitly approved for this exact video, you may publish using the correct verified account and then promptly submit the resulting URL to the exact campaign according to its rules. If this cannot be completed within the permitted window, stop instead of falsely asserting submission.
>
> On completion, tell me: task ID, campaign, verified requirements, actual MP4/artifact link, what actions were taken, whether anything was actually published or submitted, source URLs, what I must approve, and errors. Never claim revenue merely because a webhook accepted the task.
>
> If a separate scoped ClipFleet callback token is securely available on your computer, POST a single JSON report to `https://clipfleet-ops.averymiddlebrook2014.workers.dev/api/grokbot/report` with header `Authorization: Bearer <scoped callback token>`, body `{"task_id":"<uuid>","action":"needs_approval","note":"<short non-sensitive result>"}`. Allowed action values are `prepared`, `needs_approval`, `published_unverified`, `submitted_unverified`, `blocked`, `failed`, `done`. Never include private personal data, secrets or media in the report. If callback credentials are unavailable, report in your Bot chat instead.

## Boundaries and fault tolerance

- The webhook secret lives in GitHub Actions secrets; it is not served to the dashboard or included in a webhook body.
- ClipFleet stores a unique `job_id` in the Bot task queue. It will not hand off the same job twice by default.
- No automatic retry is issued after a webhook 200 or ambiguous timeout, because that could cause duplicate uploads/submissions. Only **definite non-200** failures may be explicitly retried from the dashboard.
- A webhook 200 confirms invocation only. Bot completion is observed via its chat or the optional scoped callback, not by assuming success.
- A report received from the Bot is **not** automatically applied to the trusted campaign workflow or payout ledger.
- No anonymous public API permits task reads or callbacks. Report endpoints require a separate 32+ character token.
- GitHub Actions artifact access follows GitHub's own permissions and retention periods.
- Private account credentials remain in your authorized Grok Bot browser session or official connected account. Since multiple Grok Bots on the same account can share a computer, consider that trust boundary when using social accounts.
- The browser routine must respect Content Rewards and social network rules. Login/CAPTCHA challenges, verification, rights grants, brand pre-approvals and policy constraints cannot be circumvented by the bot.
