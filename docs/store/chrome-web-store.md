# Chrome Web Store submission kit

Everything needed to submit RepoLens to the Chrome Web Store, kept next to the
code so it changes with the code. `npm run package` fails if the manifest asks
for a permission that has no justification in this file.

## 1. Build and verify the upload

```bash
npm ci
npm run verify            # tests, lint, HTML, format, release consistency, package
```

`npm run verify` ends by writing `dist/repolens-v<version>.zip` and its `.sha256`.
Upload **`repolens-v<version>.zip` only**. The separate `-store-kit.zip` contains
listing materials, not an installable extension. The JSON inventory records every
extension file's size and SHA-256. Rebuild with the same Node/zlib versions for
byte-identical archives; CI uses Node 20. `npm run package:check` validates without
writing files. It rejects symlinks, unexpected file types, development/credential
files and common secret signatures, and checks required asset dimensions.
Signature scanning cannot detect every possible secret; inspect the inventory too.

Before uploading a new version:

- [ ] `npm run verify` passes on a clean checkout of the commit you will tag.
- [ ] Load the unzipped `dist/` package via **chrome://extensions → Load unpacked**
      and open Library, Options, What's New, and one scan. The DevTools console
      for each page should show no CSP or missing-file errors.
- [ ] If publishing a GitHub Release is authorized, tag the tested commit
      `v<version>` and push the tag. The release workflow publishes automatically.
      A main-branch push alone uploads CI artifacts; it does not publish a release.
- [ ] Upload the same zip (compare the SHA-256) in the developer dashboard.

## 2. Listing copy

**Name:** RepoLens

**Summary** (manifest `description`, 132 chars max):

> Click any repo. Get a straight answer on whether to use it.

**Category:** Developer Tools · **Language:** English

**Description:**

> Stars tell you a project is popular. They don't tell you whether it fits your
> problem. RepoLens answers the question you have: should I use this, and what
> am I signing up for?
>
> Open a GitHub or GitLab repository, npm package, or PyPI project page and click
> the RepoLens icon. It fetches repository metadata and README content, sends
> them to the AI model you picked, and opens a tab that
> leads with a verdict: the fit call, the bottom line, measured facts, structured
> risks, a 30-minute trial plan, and a learning path. You see the answer before
> the README's pitch.
>
> WHAT YOU GET
> • Verdict first: adopt, trial, compare, hold, or avoid, with confidence and evidence.
> • Deep Dive and Blueprint: a plain-English architecture walkthrough and a zoomable map of how the code fits together.
> • A library that remembers: every scan is saved in your browser. Search it, ask it questions, compare repos side by side, score them against your own rubric, and get a review queue for decisions that are due.
> • Batch triage: paste a list of repos and scan them in one go.
> • Right-click a supported repo link and choose "Scan with RepoLens".
>
> BRING YOUR OWN MODEL
> Connect Claude, ChatGPT, Gemini, Grok, OpenRouter, DeepSeek, Groq, Qwen, Kimi,
> GLM, NVIDIA NIM, a public HTTPS OpenAI- or Anthropic-compatible endpoint, or a
> local Ollama model. AI features need your own provider access or a separately
> installed local model. Provider fees, quotas, and terms apply. Subscription
> sign-in availability depends on the provider and your plan; it is not guaranteed.
> Route each part of a scan to a different model. AI output can be incomplete or
> incorrect; verify important claims against the source. RepoLens is independent
> and is not endorsed by these providers.
>
> PRIVATE BY DESIGN
> There is no RepoLens analysis server, account, analytics, or telemetry. Settings,
> credentials, and your library are stored locally. Credentials authenticate
> requests to your selected service; relevant repository content, saved analyses,
> and your questions/goals go to the selected AI provider when you use AI features.
> Connected providers can be tried as fallbacks, even after a local model fails.
> Deep Dive may use a connected embedding provider for concept matching. Disconnect
> cloud providers for local-only AI.
> Options also fetches model catalogs. RepoLens reads requested repository URLs,
> not a general browsing history. Library Clear deletes saved analysis data;
> provider retention is governed by that provider's policy. See our privacy policy.
>
> Open source (MIT): https://github.com/New1Direction/RepoLens

**Homepage URL:** https://new1direction.github.io/RepoLens/
**Support URL:** https://github.com/New1Direction/RepoLens/issues
**Privacy policy URL:** https://new1direction.github.io/RepoLens/docs/privacy

## 3. Privacy practices tab

**Single purpose:**

> RepoLens evaluates open-source repositories and packages. When the user clicks
> the toolbar icon on a GitHub, GitLab, npm, or PyPI page (or right-clicks a repo
> link), it fetches the repo's public metadata and asks the AI provider the user
> configured for a verdict, then shows and saves that analysis locally.

**Remote code:** No. All JavaScript ships in the package; the CSP is
`script-src 'self'`. `npm run package` rejects inline scripts and remote imports.

**Data usage** — owner must review and select the following for this build.
Google requires disclosure even for local-only processing; this is not a claim
that the developer receives this data. Do not select "no data collected":

| Category                            | Why it is declared                                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication information          | API keys and OAuth tokens the user enters are stored locally and sent only to that provider to authenticate the user's own requests.   |
| Personally identifiable information | Provider account identifiers may be returned in OAuth credentials and used to authenticate provider requests.                          |
| Web history                         | URLs/identifiers of repositories the user asks to scan are processed and saved; no general browsing-history database is queried.       |
| Personal communications             | User questions, recent Ask exchanges, and answers are processed locally and by the selected AI provider.                               |
| Website content                     | Public repo content (metadata, README, file list) is sent to the user's chosen AI provider to produce the analysis the user asked for. |

No dedicated collection of financial/payment, health, location, or activity
tracking data is implemented. Free-form input can nevertheless contain personal
data: the policy warns users not to submit sensitive information.

The **owner**, after reviewing the policy and build, must certify all three:
not sold to third parties; not used or transferred for
purposes unrelated to the single purpose; not used to determine
creditworthiness or for lending.

### Permission justifications

Paste each line into the matching field.

| Permission      | Justification                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `storage`       | Saves the user's settings, provider keys/tokens, and in-progress scan state locally. The library itself is in IndexedDB.            |
| `activeTab`     | Reads the URL of the tab where the user clicked the toolbar icon, to identify the repo or package to analyse.                       |
| `identity`      | Runs the OpenRouter sign-in with `chrome.identity.launchWebAuthFlow`, so users can connect OpenRouter without pasting a key.        |
| `notifications` | Tells the user when a long scan or batch scan finishes; clicking the notification focuses the result.                               |
| `contextMenus`  | Adds "Scan with RepoLens" to the right-click menu for links, so a repo can be scanned without opening it.                           |
| `alarms`        | Runs a once-a-day local check that counts saved repos not re-scanned in 14 days, for the Library's drift banner. No network access. |

**Host permissions.** These cover repository APIs, provider requests and token
refresh, model catalogs when Options opens, and local runner health checks.
Built-in provider hosts remain declared because scans run in a service worker
after the originating user gesture; custom HTTPS origins are requested on Save.

| Host                                                                                                                                 | Justification                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://github.com/*` `https://gitlab.com/*` `https://www.npmjs.com/*` `https://pypi.org/*`                                         | The pages RepoLens analyses. A one-line content script marks the tab as a repo page so the icon lights up; it reads nothing else. PyPI also serves package JSON here.               |
| `https://api.github.com/*` `https://registry.npmjs.org/*`                                                                            | Public repo and package metadata, README, and file tree for the scan, plus GitHub search for Discover.                                                                              |
| `https://api.anthropic.com/*` `https://console.anthropic.com/*`                                                                      | Claude API calls, and the Claude sign-in token exchange.                                                                                                                            |
| `https://api.openai.com/*` `https://auth.openai.com/*` `https://chatgpt.com/*`                                                       | OpenAI API calls, ChatGPT sign-in token exchange, and the Codex Responses endpoint used with a ChatGPT subscription.                                                                |
| `https://generativelanguage.googleapis.com/*`                                                                                        | Google Gemini API calls and its model list.                                                                                                                                         |
| `https://openrouter.ai/*`                                                                                                            | OpenRouter API calls, model catalog, and key exchange after sign-in.                                                                                                                |
| `https://api.x.ai/*` `https://auth.x.ai/*` `https://cli-chat-proxy.grok.com/*`                                                       | xAI Grok API calls, Grok device sign-in, and the Grok subscription chat endpoint.                                                                                                   |
| `https://inference-api.nousresearch.com/*`                                                                                           | Nous Research API calls and model list.                                                                                                                                             |
| `https://api.deepseek.com/*` `https://api.groq.com/*` `https://integrate.api.nvidia.com/*`                                           | DeepSeek, Groq, and NVIDIA NIM API calls when the user connects them.                                                                                                               |
| `https://api.moonshot.ai/*` `https://api.moonshot.cn/*` `https://api.kimi.com/*`                                                     | Kimi / Moonshot API calls (global, China, and Coding Plan endpoints).                                                                                                               |
| `https://open.bigmodel.cn/*` `https://dashscope.aliyuncs.com/*` `https://api.xiaomimimo.com/*` `https://ark.cn-beijing.volces.com/*` | Zhipu GLM, Alibaba Qwen, Xiaomi MiMo, and Volcengine Ark API calls when the user connects them.                                                                                     |
| `https://ollama.com/*`                                                                                                               | Ollama Cloud API calls.                                                                                                                                                             |
| `https://api.minimax.io/*` `https://api.minimaxi.com/*`                                                                              | MiniMax API calls (global and China endpoints).                                                                                                                                     |
| `http://localhost/*` `http://127.0.0.1/*`                                                                                            | Local Ollama, the optional local deeper-scan runner, and the ChatGPT sign-in loopback redirect (`localhost:1455`), which RepoLens reads to finish sign-in.                          |
| `https://*/*` (optional)                                                                                                             | Requested at runtime when saving a custom model endpoint or importing from VelesDB, for the selected origin. HTTP is not allowed except for the explicitly declared loopback hosts. |

RepoLens does **not** request `tabs`, `webNavigation`, `history`, `scripting`,
or `<all_urls>`. Host permissions still grant access to the listed sites; do not
infer privacy disclosures from permission-warning wording. Chrome versions can
group warnings differently.

## 4. Store assets

Generated with `node tools/store-assets.mjs --chrome /path/to/chrome` after
`npm ci`. The tool uses a disposable, credential-free extension profile. It
captures the actual built-in welcome tour with its **DEMO** repository and the
unconnected Settings page, not fabricated scans or provider endorsements. No
browser chrome or captions are added. Screenshots are captured at 2× and saved
at Chrome's required 1280×800 size. Model results and performance are not proved
by these images. Live catalog contents may change; checked-in assets are the
reviewed release inputs, not regenerated during packaging.

| Asset              | Required                  | Spec                   | File                                                                      |
| ------------------ | ------------------------- | ---------------------- | ------------------------------------------------------------------------- |
| Store icon         | Yes                       | 128×128 PNG, 96×96 art | `docs/store/assets/store-icon-128.png`                                    |
| Screenshots (1–5)  | At least 1                | 1280×800 PNG           | `docs/store/assets/screenshot-1-library.png`, `screenshot-2-settings.png` |
| Small promo tile   | Yes                       | 440×280 PNG/JPEG       | `docs/store/assets/promo-small-440x280.png`                               |
| Marquee promo tile | No (needed for featuring) | 1400×560 PNG/JPEG      | Not made yet                                                              |

Checklist:

- [x] Store icon and small promo tile generated from the shipped icon and
      manifest copy.
- [x] Library tour and unconnected Settings captured from the real extension.
- [x] Screenshots are 1280×800; the sample is labelled DEMO, not a live scan.
- [x] No credentials, private profile content, or invented AI results appear.
- [ ] The listing's privacy policy URL loads and matches `PRIVACY.md`.

## 5. Reviewer instructions (paste into Test instructions)

RepoLens has no developer-hosted account or subscription. On installation Options
opens. Right-click the toolbar icon → Options to reopen it; Options links to the
Library. The welcome tour seeds a clearly labelled DEMO repository. This is
bundled example content, not a completed live scan. Settings, Library, tour, and
local preferences can be reviewed without signing in.

For a real scan, configure your own supported API key in Options, or use local
Ollama: install Ollama, run `ollama pull llama3.2:3b`, start its server with
`OLLAMA_ORIGINS=chrome-extension://*`, then enable Ollama under More model
providers. This uses your computer's resources and may take several minutes.
Disconnect other providers for local-only AI; otherwise connected services can
receive fallback requests and embeddings.
Visit `https://github.com/honojs/hono` and click RepoLens, or right-click the link
and select Scan with RepoLens. A result tab should finish with analysis; open
Library and reopen the saved result. Ask sends questions to your selected model.
Local Ollama is keyless; cloud providers may require payment/credits. No shared
reviewer credentials are embedded. Subscription sign-ins depend on provider
availability and account entitlement; use an API key or local Ollama for review.

Custom endpoints require HTTPS and Chrome's per-origin grant. For import testing,
Options → Import from VelesDB accepts HTTPS or the explicit HTTP loopback hosts.
Library → Clear → Confirm removes saved data; provider Disconnect removes credentials.

## 6. Owner-only submission checklist

These are **pending owner actions**, not completed acceptance or store approval:

1. Run the build/smoke steps above on the exact upload. From the artifact directory,
   verify `sha256sum -c repolens-v3.2.1.zip.sha256` (macOS: `shasum -a 256 -c repolens-v3.2.1.zip.sha256`).
   Complete one real scan and one actual provider authentication flow. Headless
   package smoke tests do not prove toolbar activation or third-party OAuth.
2. Confirm version `3.2.1` exceeds any version previously uploaded to the same
   store item, including drafts. Dashboard state is not available from Git.
   If it does not, bump all version sources, rebuild and revalidate first.
3. Open https://chrome.google.com/webstore/devconsole/ using the publisher account.
   Complete registration, fee, contact email verification, 2-step verification,
   and any requested trader/account declarations yourself. No agent can accept
   these agreements or attest to your legal status for you.
4. Create a new item (or update the existing RepoLens item) and upload only
   `repolens-v3.2.1.zip`. Add section 2's copy, Developer Tools category, English,
   icon, small promo, and both screenshots in their numbered order.
5. Set homepage, support, and privacy URLs above. Confirm the live privacy page
   says **2026-10-14 / 3.2.1** and matches `PRIVACY.md`; wait for the normal Pages
   deployment after shipping if needed. Do not submit with the older policy.
6. Fill Privacy practices using section 3; personally review and accept the
   three Limited Use certifications. Add section 5 as reviewer instructions.
   Do not advertise universal subscription compatibility, free cloud inference,
   official provider affiliation, or zero data transmission.
7. Set distribution regions/visibility and applicable payment disclosures (the
   extension itself charges no fee; external model access may cost money). Check
   every dashboard warning. The owner chooses when to click **Submit for review**.
   Record item ID, uploaded version/hash, submission date, and review result.

Policy references: [image requirements](https://developer.chrome.com/docs/webstore/images),
[privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy),
[local processing and user data](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
This kit assists review; it does not guarantee Google's acceptance.

## 7. After the listing is live

1. Set `CHROME_WEB_STORE_URL` in `website/lib/distribution.ts` to the listing
   URL. Every install button on the site switches to it.
2. Add the store badge to the top of `README.md` and the Install section.
3. Keep the manual zip install in the docs for people who can't use the store.
