# Connect Everything — ClipFleet Account Hub

Open the deployed app at **https://clipfleet-ops.averymiddlebrook2014.workers.dev**. The **Connect Everything** section appears at the top of Mission Control, before the campaign and production tools.

Every card has an **Open** button pointing to the provider's official website, additional setup/help links, and **I connected this**. The latter saves your own confirmation to private Cloudflare D1. **It is NOT third-party OAuth or proof of verification.** No accounts are silently authenticated. ClipFleet never receives your passwords, external login cookies, OAuth tokens or payout credentials.

## Recommended order

1. **Content Rewards:** Open https://contentrewards.com/c/discover and sign in. To link socials, visit **Settings → Connected accounts → Connect account**, select the correct social login, approve the provider's own authorization screen, and verify it shows **Connected**. Guide: https://help.contentrewards.com/en/articles/16746780-connect-your-social-accounts .
2. **Whop:** Open https://whop.com/ and sign in to your payout account. Configure payment withdrawals and any identity verification inside Whop. Help: https://help.whop.com/en/articles/10336709-how-to-setup-payouts-withdrawal .
3. **Grok Bot:** Follow https://prod.cursor.com/docs/grok-bot/get-started to install the desktop app and sign in through your eligible account. Create a ClipFleet Browser Operator Bot. Eligible Grok Bot access may require a subscription.
4. **Grok Bot webhook:** In the Grok Bot desktop app, create a webhook-triggered routine. Open its routine details, copy the POST to URL and key, and store them in the GitHub repository Secrets (not variables): https://github.com/amiddlebrook/Clipfleet/settings/secrets/actions . Secret names must be **GROKBOT_WEBHOOK_URL** and **GROKBOT_WEBHOOK_KEY**. Test through https://github.com/amiddlebrook/Clipfleet/actions/workflows/grokbot-dispatch.yml . See [complete routine instructions](GROKBOT-INTEGRATION.md).
5. **YouTube Shorts:** Sign into your actual YouTube channel on https://www.youtube.com/ . Connect the same channel in Content Rewards. Save your handle in ClipFleet's **Social account presets**. Only mark complete after Content Rewards reports **Connected**.
6. **TikTok:** Sign into https://www.tiktok.com/ . Connect the same account in Content Rewards. Save a matching ClipFleet preset and record your confirmation.
7. **Instagram Reels:** Sign into https://www.instagram.com/ . Convert to Instagram Business if needed, then connect it inside Content Rewards. Save its preset and confirm.
8. **X:** Sign into https://x.com/ . Connect the account inside Content Rewards, save its preset in ClipFleet, then confirm.

A Social account preset saves only the public platform and handle. It never establishes OAuth. A completed mark in the hub reflects **your assertion**, not that ClipFleet inspected Content Rewards, Whop or Grok Bot credentials.

**Infrastructure buttons:** GitHub Actions opens the clip production/deployment workflows; Cloudflare opens your account dashboard; GitHub Actions Secrets opens webhook configuration. Cloudflare D1 saves manual setup progress after you connect the ClipFleet admin token.

## Once connected

Choose a campaign; join it in Content Rewards; follow its real brief, rights requirements and eligibility rules; select only permitted publishing platforms; create separately reviewed video renders; publish through an authorized account; submit each actual public post URL to Content Rewards within 30 minutes. ClipFleet's saved milestones and Bot webhooks are not themselves verified social publishing or payout.

If you see **Not confirmed**, finish account linking with the provider, then press **I connected this**. If you disconnect an account at the provider later, use **Mark not done** in ClipFleet to keep the checklist truthful.

## Why there is no single-click OAuth inside ClipFleet

External providers have individual consent flows, developer-app requirements, security policies and APIs. ClipFleet currently does not have registered and authorized official provider OAuth applications for Content Rewards, Whop withdrawals or social publishing. It links to the supported provider site instead of inventing connections. Grok Bot uses a documented webhook trigger, but its secrets must be configured first; webhook acceptance is not proof that the Bot finished a task.

Never enter a social or payout password into ClipFleet.