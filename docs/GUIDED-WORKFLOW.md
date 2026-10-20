# ClipFleet — Guided Campaign Workflow

**Open the live app:** https://clipfleet-ops.averymiddlebrook2014.workers.dev

## What is automated

ClipFleet indexes public campaign candidates, ranks opportunities, saves profiles, plans approved jobs, renders videos in bounded GitHub Actions runs, and recognizes completed job status from Cloudflare D1.

## How to operate the 10 stages

1. **Join** — Open the selected Content Rewards campaign from the Autopilot link. Join with an eligible creator account, then click the explicit completion button.
2. **Social** — Connect your account in Content Rewards (not just Whop). Save its public handle as a preset in ClipFleet, choose it, verify the campaign permits that platform, then confirm.
3. **Brief** — Read the entire official campaign page; confirm required creative format, disclosures, platform, minimum views and any prior approval.
4. **Rights** — Record the precise campaign license or sponsor-provided asset reference. Confirm media-use permission; do not use arbitrary third-party clips.
5. **Profile** — Paste the actual brief in the AI form, optionally generate editable text suggestions, review every field, select permitted creative and social platform, then authorize the profile. This stage advances from the saved profile automatically.
6. **Render** — Plan approved jobs and open the GitHub Pipeline to trigger a run if needed. A ready video advances this stage automatically.
7. **Review** — Download the MP4 from the run's Artifacts, watch it, choose its job ID and explicitly confirm your review.
8. **Publish** — Use the guided link to the appropriate social platform. Publish the actual approved clip yourself; record its public post URL and real publishing time.
9. **Submit** — Follow the exact Content Rewards campaign link and manually submit the public post URL within 30 minutes of actual publication. Confirm only when submitted.
10. **Outcome** — Check Content Rewards for the genuine submission decision or payment. Record the actual status yourself.

## Multiple videos and progress

- Progress is stored in private Cloudflare D1 records per campaign and displayed after reconnecting your admin token.
- Manual steps are self-attested; neither a valid URL nor a saved social handle proves a real campaign submission or payment.
- Real campaign profiles and ready render jobs advance their stages automatically.
- Each manual confirmation appears in the timestamped activity log.
- Each reported submission is stored separately with its job, platform, public URL, timestamps and manually recorded outcome.
- After recording a submission, use **Start tracking another clip** to retain the verified campaign prep while moving to an unused render.
- You can update the outcome of an earlier submission while working on another clip.
- The video render limit and platform rules still apply; ClipFleet cannot create more campaign-approved variants than permitted.

## Navigation

- Campaign join, brief and submission: Exact Content Rewards campaign URL from the selected campaign.
- Connected-accounts help: https://help.contentrewards.com/en/articles/16746780-connect-your-social-accounts
- Creative drafting, profile configuration and social presets: Internal ClipFleet dashboard sections.
- Rendering and downloads: https://github.com/amiddlebrook/Clipfleet/actions/workflows/agent-loop.yml
- Publishing: YouTube Studio / TikTok Upload / Instagram / Facebook / X (depending on campaign and connected account).
- Submission help: https://help.contentrewards.com/en/articles/15319814-submit-a-video
- Decision and payout: Your authenticated Content Rewards account.

## Honest limits

ClipFleet does not log into Content Rewards, automatically join campaigns, verify legal media rights, complete social OAuth, post videos, submit payout claims, verify view counts or confirm payments. It navigates to official destinations and retains explicit operator confirmations.

The 30-minute countdown is calculated from the time you report, not a social-platform API timestamp. Do not backdate it or claim success before an actual submission. Code, public campaign data and sponsor rules may change; always follow the official brief.
