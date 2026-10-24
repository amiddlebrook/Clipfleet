# ClipFleet free browser agent — Browser Use + OpenRouter

This is the default **$0 subscription** browser assistant for ClipFleet. Grok Bot stays optional, not required.

**What works now:** A local Windows browser can use your own OpenRouter free model to inspect public Content Rewards campaign briefs and produce a read-only summary of platform allowances, sponsor requirements and rights questions. Another command opens the correct social publishing site for you. It does **not** automatically join campaigns, log in to your social accounts, publish videos, submit clips, or verify payment.

The agent code lives in [scripts/local_openrouter_agent.py](../scripts/local_openrouter_agent.py), with installer [scripts/setup-openrouter-agent.ps1](../scripts/setup-openrouter-agent.ps1). ClipFleet's dashboard offers direct setup buttons. A Cloudflare webpage cannot directly launch an unrestricted Python program on your computer, so a local installation is required.

## Setup on Windows

1. Create an OpenRouter key at https://openrouter.ai/settings/keys if you do not already have one. A paid account is not required. Never paste it into the public ClipFleet website, GitHub repository, issue, or chat.
2. Make sure Python **3.12** is installed (https://www.python.org/downloads/). The Windows `py` launcher should work.
3. Download or clone the repository from https://github.com/amiddlebrook/Clipfleet . Open **Windows PowerShell** in its root directory.
4. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-openrouter-agent.ps1
```

5. Edit the new **local, gitignored** `.env` with Notepad:

```dotenv
OPENROUTER_API_KEY=your_secret_key_goes_here
OPENROUTER_MODEL=openrouter/free
```

6. Verify the key and available free quota:

```powershell
.\.venv\Scripts\python.exe scripts\local_openrouter_agent.py --mode check-key
```

7. From ClipFleet select a campaign, copy its **official Content Rewards URL**, then run:

```powershell
.\.venv\Scripts\python.exe scripts\local_openrouter_agent.py --mode review-campaign --campaign-url "https://contentrewards.com/c/campaigns/REPLACE_WITH_REAL_ID"
```

8. To open the publishing screen in your normal browser (manual posting only):

```powershell
.\.venv\Scripts\python.exe scripts\local_openrouter_agent.py --mode open-upload --platform youtube
```

Available `--platform` values: `youtube`, `tiktok`, `instagram`, `x`.

## Free-only enforcement

The script accepts **only** `openrouter/free` or a specific model whose ID ends in `:free`. Any other model is refused before requesting inference. OpenRouter's `openrouter/free` chooses a free model appropriate for the request; selection may vary. You may choose a tool-capable free model from https://openrouter.ai/models?pricing=free by setting `OPENROUTER_MODEL=provider/model:free`.

Current OpenRouter Free tier advertises **50 requests/day** and may rate-limit or change available models; see https://openrouter.ai/pricing and https://openrouter.ai/docs/api/api-reference/rate-limits . Browsing actions can require several model calls. Free models vary significantly in reliability and tool-call compatibility. This is a practical assistant, not a guarantee of unattended end-to-end social publishing.

## Privacy and safety

- **Never** put `OPENROUTER_API_KEY` in ClipFleet's public HTML, Cloudflare Worker configuration, browser localStorage, or GitHub files. The Windows script reads it from your local `.env` file, ignored by Git.
- The AI review runs in an **isolated Chromium user profile** under `~/.clipfleet/review-browser`, not your everyday Chrome profile. It is restricted to Content Rewards domains and asked to read only a public campaign brief. Do not sign into private social or payout accounts inside this AI-controlled review browser.
- The page content the agent reads is sent to OpenRouter's chosen model provider. Do not use the AI reviewer for private account details, passwords, personally identifying data or confidential sponsor contracts.
- Free browser agents may follow hostile page instructions or make mistakes. Treat output as untrusted draft research and personally verify eligibility, terms, rights and posting rules.
- Publishing, campaign submissions and payouts remain manually verified in ClipFleet. Grok Bot webhook workflow is retained only for users who independently choose to connect a paid bot.
- This runs on your own Windows computer while it is on; GitHub Actions/Cloudflare hosting remain free-tier, but don't run this browser locally when your PC is powered off.

## Next steps for richer automation

More advanced **human-approved** browser preparation (drafting social upload forms, selecting specific video artifacts, bringing users to the submission field) can be built on the same Browser Use infrastructure. Those actions require provider terms/authorization checks and more reliable model testing first. ClipFleet does not currently claim them as complete.
