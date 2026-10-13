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
Upload that zip, nothing else. The build is deterministic: rebuilding the same
commit on the same Node major produces the same SHA-256.

Before uploading a new version:

- [ ] `npm run verify` passes on a clean checkout of the commit you will tag.
- [ ] Load the unzipped `dist/` package via **chrome://extensions → Load unpacked**
      and open Library, Options, What's New, and one scan. The DevTools console
      for each page should show no CSP or missing-file errors.
- [ ] Tag the commit `v<version>` and push the tag. The release workflow re-runs
      the checks, rebuilds the zip, and attaches it to a GitHub Release.
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
> Open a GitHub, GitLab, npm, or PyPI page and click the RepoLens icon. RepoLens
> reads the repo, runs it past the AI model you picked, and opens a tab that
> leads with a verdict: the fit call, the bottom line, measured facts, structured
> risks, a 30-minute trial plan, and a learning path. You see the answer before
> the README's pitch.
>
> WHAT YOU GET
> • Verdict first: adopt, trial, compare, hold, or avoid, with confidence and evidence.
> • Deep Dive and Blueprint: a plain-English architecture walkthrough and a zoomable map of how the code fits together.
> • A library that remembers: every scan is saved in your browser. Search it, ask it questions, compare repos side by side, score them against your own rubric, and get a review queue for decisions that are due.
> • Batch triage: paste a list of repos and scan them in one go.
> • Right-click any repo link and choose "Scan with RepoLens".
>
> BRING YOUR OWN MODEL
> Connect Claude, ChatGPT, Gemini, Grok, OpenRouter, DeepSeek, Groq, Qwen, Kimi,
> GLM, NVIDIA NIM, any OpenAI- or Anthropic-compatible endpoint, or a local
> Ollama model with no key at all. Sign in with your subscription where the
> provider supports it, or paste an API key. Route each part of a scan to a
> different model.
>
> PRIVATE BY DESIGN
> There is no RepoLens server, account, analytics, or telemetry. Your keys and
> your library stay in your browser. Repo content goes only to the AI provider
> you chose, when you start a scan.
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

**Data usage** — tick these, and nothing else:

| Category                   | Why it is declared                                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication information | API keys and OAuth tokens the user enters are stored locally and sent only to that provider to authenticate the user's own requests.   |
| Website content            | Public repo content (metadata, README, file list) is sent to the user's chosen AI provider to produce the analysis the user asked for. |

Certify all three: not sold to third parties; not used or transferred for
purposes unrelated to the single purpose; not used to determine
creditworthiness or for lending.

### Permission justifications

Paste each line into the matching field.

| Permission      | Justification                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `storage`       | Saves the user's settings, provider keys/tokens, and in-progress scan state locally. The library itself is in IndexedDB.             |
| `activeTab`     | Reads the URL of the tab where the user clicked the toolbar icon, to know which repo or package to analyse. No access to other tabs. |
| `identity`      | Runs the OpenRouter sign-in with `chrome.identity.launchWebAuthFlow`, so users can connect OpenRouter without pasting a key.         |
| `notifications` | Tells the user when a long scan or batch scan finishes; clicking the notification focuses the result.                                |
| `contextMenus`  | Adds "Scan with RepoLens" to the right-click menu for links, so a repo can be scanned without opening it.                            |
| `alarms`        | Runs a once-a-day local check that counts saved repos not re-scanned in 14 days, for the Library's drift banner. No network access.  |

**Host permissions.** Each host below is contacted only when the user starts a
scan or connects that provider.

| Host                                                                                                                                 | Justification                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://github.com/*` `https://gitlab.com/*` `https://www.npmjs.com/*` `https://pypi.org/*`                                         | The pages RepoLens analyses. A one-line content script marks the tab as a repo page so the icon lights up; it reads nothing else. PyPI also serves package JSON here. |
| `https://api.github.com/*` `https://registry.npmjs.org/*`                                                                            | Public repo and package metadata, README, and file tree for the scan, plus GitHub search for Discover.                                                                |
| `https://api.anthropic.com/*` `https://console.anthropic.com/*`                                                                      | Claude API calls, and the Claude sign-in token exchange.                                                                                                              |
| `https://api.openai.com/*` `https://auth.openai.com/*` `https://chatgpt.com/*`                                                       | OpenAI API calls, ChatGPT sign-in token exchange, and the Codex Responses endpoint used with a ChatGPT subscription.                                                  |
| `https://generativelanguage.googleapis.com/*`                                                                                        | Google Gemini API calls and its model list.                                                                                                                           |
| `https://openrouter.ai/*`                                                                                                            | OpenRouter API calls, model catalog, and key exchange after sign-in.                                                                                                  |
| `https://api.x.ai/*` `https://auth.x.ai/*` `https://cli-chat-proxy.grok.com/*`                                                       | xAI Grok API calls, Grok device sign-in, and the Grok subscription chat endpoint.                                                                                     |
| `https://inference-api.nousresearch.com/*`                                                                                           | Nous Research API calls and model list.                                                                                                                               |
| `https://api.deepseek.com/*` `https://api.groq.com/*` `https://integrate.api.nvidia.com/*`                                           | DeepSeek, Groq, and NVIDIA NIM API calls when the user connects them.                                                                                                 |
| `https://api.moonshot.ai/*` `https://api.moonshot.cn/*` `https://api.kimi.com/*`                                                     | Kimi / Moonshot API calls (global, China, and Coding Plan endpoints).                                                                                                 |
| `https://open.bigmodel.cn/*` `https://dashscope.aliyuncs.com/*` `https://api.xiaomimimo.com/*` `https://ark.cn-beijing.volces.com/*` | Zhipu GLM, Alibaba Qwen, Xiaomi MiMo, and Volcengine Ark API calls when the user connects them.                                                                       |
| `https://ollama.com/*`                                                                                                               | Ollama Cloud API calls.                                                                                                                                               |
| `https://api.minimax.io/*` `https://api.minimaxi.com/*`                                                                              | MiniMax API calls (global and China endpoints).                                                                                                                       |
| `http://localhost/*` `http://127.0.0.1/*`                                                                                            | Local Ollama, the optional local deeper-scan runner, and the ChatGPT sign-in loopback redirect (`localhost:1455`), which RepoLens reads to finish sign-in.            |
| `https://*/*` `http://*/*` (optional)                                                                                                | Requested at runtime only when the user adds a custom model endpoint or imports from their own VelesDB server, for that one origin.                                   |

RepoLens does **not** request `tabs`, `webNavigation`, `history`, `scripting`,
or `<all_urls>`. The install prompt shows only "Read and change your data on"
the listed sites and "Display notifications".

## 4. Store assets

Generated from the real extension UI and the shipped icon by
`tools/store-assets.mjs` (see its header for usage). Screenshots come from the
library in the capture profile, so scan real repos there with a strong model
first; a weak local model produces thin verdicts that undersell the product.

| Asset              | Required                  | Spec                   | File                                        |
| ------------------ | ------------------------- | ---------------------- | ------------------------------------------- |
| Store icon         | Yes                       | 128×128 PNG, 96×96 art | `docs/store/assets/store-icon-128.png`      |
| Screenshots (1–5)  | At least 1                | 1280×800 PNG/JPEG      | To capture — needs real scans (see below)   |
| Small promo tile   | Yes                       | 440×280 PNG/JPEG       | `docs/store/assets/promo-small-440x280.png` |
| Marquee promo tile | No (needed for featuring) | 1400×560 PNG/JPEG      | Not made yet                                |

Checklist:

- [x] Store icon and small promo tile generated from the shipped icon and
      manifest copy.
- [ ] Scan 3–5 well-known repos with a strong model in the capture profile, then
      run `tools/store-assets.mjs` to write `screenshot-1-verdict.png`,
      `screenshot-2-library.png`, and `screenshot-3-settings.png`.
- [ ] Screenshots show the real UI at 1280×800 with no browser chrome, and every
      claim in a screenshot matches the shipped build.
- [ ] Captions (optional) use the listing's own wording.
- [ ] The listing's privacy policy URL loads and matches `PRIVACY.md`.

## 5. After the listing is live

1. Set `CHROME_WEB_STORE_URL` in `website/lib/distribution.ts` to the listing
   URL. Every install button on the site switches to it.
2. Add the store badge to the top of `README.md` and the Install section.
3. Keep the manual zip install in the docs for people who can't use the store.
