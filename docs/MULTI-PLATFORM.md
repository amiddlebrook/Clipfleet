# ClipFleet — Four-platform publishing matrix

**Dashboard:** https://clipfleet-ops.averymiddlebrook2014.workers.dev

This release adds parallel, independent production/submission lanes for **YouTube Shorts, TikTok, Instagram Reels, and X**. It does not log into social accounts or Content Rewards without authorization; actual posting and Content Rewards submission remain external tasks guided by ClipFleet and optionally prepared by an authorized Grok Bot.

## Connect your accounts once

- Create one creator account in **Content Rewards**, connected to your Whop withdrawal account.
- Connect and verify each social account **inside Content Rewards**, not only in Whop. Content Rewards currently supports YouTube, TikTok, Instagram and X. Instagram requires a **Business** account.
- In ClipFleet, connect your existing administrator token. Under **Social account presets**, save each platform handle and attest that the corresponding account actually shows Connected inside Content Rewards. Account presets are user-entered handles, **not OAuth connections**.
- Join the specific campaign through Content Rewards. The campaign determines which social networks and formats are allowed; a campaign accepting one platform **does not automatically accept all four**.

## Configure four independent lanes

1. Find a campaign in the public index and select it in **Campaign Autopilot**.
2. Complete actual Join → Social → Brief → Rights milestones, following the official links and recording real rights evidence.
3. Fill the approved profile under **Authorize a campaign** (you may use the AI draft assistant after pasting the official sponsor brief). Choose one genuinely permitted initial platform, select the account, and verify licensing. The profile's already-approved claims/footage are reused only for the same campaign.
4. In **Four-channel distribution**, choose the same campaign from its dropdown.
5. Review each platform's actual campaign requirements. For each allowed network, check the confirmation box and select the matching verified social preset. **Leave disallowed platforms unchecked.**
6. Press **Save permitted publishing lanes**. Distinct account-platform lanes are stored in Cloudflare D1.
7. Press **Queue distinct clips**, or use the scheduled **ClipFleet Pipeline**. The queue permits up to **six videos/day across ClipFleet**; the specific distributor requests up to four and FFmpeg renders at most two per scheduled GitHub Actions run.
8. Each completed render receives a separate platform-specific hook/creative variant, one distinct job ID, an MP4, a JSON caption manifest, and an exact GitHub Actions run URL. These are baseline graphics/footage edits rather than polished generative videos, and **must be inspected for quality and campaign compliance before publication**.
9. If the Grok Bot webhook routine is configured, each authorized completed render is handed off separately with its target platform, campaign link and public account handle. A webhook 200 is *only* acceptance of the bot run.
10. Under the corresponding lane, open its render artifact, watch the actual MP4, and check **Mark reviewed** once it passes the brand requirements.
11. Follow the platform-specific **Open YouTube / TikTok / Instagram / X** link to publish through an authorized, verified account. Record the actual public post URL and exact publishing time in that platform's lane.
12. Submit each published post URL to the campaign **within 30 minutes of posting**. Record submission only after it actually succeeded. ClipFleet shows a per-platform countdown based on your reported publishing time and maintains a separate pending/accepted/rejected/paid ledger for each platform.
13. After an actual submission, click **Start another distinct clip** to reset just that platform lane. Previous public-post and sponsor decision records remain in the ledger.

## Safety and payout facts

- Campaigns support individual or combined platforms and can have **platform-specific rates, minimum view requirements and payout caps**. The campaign itself remains the authority. Do not infer that four platforms equals four paid posts.
- Keep content genuine and distinct; do not resubmit the same finished edit or use unauthorized material. ClipFleet uses platform-specific hooks and separately identified jobs. Verify the actual creative against the campaign; a different opening line does not alone guarantee originality.
- Each platform's social handle must already be genuinely verified in Content Rewards. Saving a preset is an operator attestation, not verification by a remote account API.
- Every submission and payout status remains **self-reported** unless an authorized provider integration is added. Video production, webhook acceptance, and social publication are not the same as an approved Content Rewards submission.
- ClipFleet does not automatically submit, log in, circumvent CAPTCHA, purchase engagement, falsify views or infer rights grants.
- Instagram may require a Business account, and posting methods change. Follow the official account-connection documentation.

Official references:

- https://help.contentrewards.com/en/articles/16746780-connect-your-social-accounts
- https://help.contentrewards.com/en/articles/16817237-find-and-apply-to-a-campaign
- https://help.contentrewards.com/en/articles/15319814-submit-a-video
- https://help.contentrewards.com/en/articles/15319816-how-do-i-earn-more-from-campaigns

## Grok Bot

The existing Grok Bot dispatcher can send a distinct run for each video, including its target social network and public account handle. It uses the configured Grok Bot routine and never passes ClipFleet's administrator credentials to the Bot. See [Grok Bot setup](GROKBOT-INTEGRATION.md). The Bot still needs authenticated creator account access and any required action-level approvals.

## Problems and diagnostic steps

- **No platform lanes enabled**: Did you finish the campaign's Join, Social, Brief, Rights, and approved profile checkpoints?
- **No jobs planned**: The campaign must still be accepting clips, have at least $20 reported budget, and have public details checked recently (within 12 hours). Zero-work import may leave campaign status unverified.
- **Four cards don't generate four videos instantly**: The free-tier pipeline renders two videos per run; trigger the workflow manually twice or let the next scheduled run continue.
- **No account options in a platform card**: Save/verify that platform under **Social account presets** first.
- **No social post URL shown**: ClipFleet is not a social OAuth uploader; open the platform through the link to actually publish the reviewed file.
- **Submitted status not automatic**: Content Rewards has no verified supported creator submission API in this integration. Only record after a real submission, and check the official portal to see acceptance.
