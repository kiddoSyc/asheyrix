# Security audit — Phase 9

This is a self-review of the codebase as it stands, not a third-party pentest. Treat it as a starting point, not a certificate.

## Fixed during this audit

### 1. `.calc` prototype-chain lookup (fixed)

`FUNCTIONS['constructor']` and similar resolved through `Object.prototype` on a plain object literal, letting a crafted input reach a function the lookup table never explicitly listed. `.calc constructor(1)` returned `NaN` rather than doing anything dangerous, but the *shape* of the bug — an attacker-indexable lookup that can return unintended values — is the kind of thing that becomes dangerous the next time the table changes. Fixed by using `Object.create(null)` for both `FUNCTIONS` and `CONSTANTS`, so there is no prototype to fall through to. See `docs/phase8-tools-fun.md` for the full explanation.

### 2. `AI_API_KEY` excluded from runtime-settable config (by design, verified)

`database/settingsStore.js`'s `SETTABLE_KEYS` intentionally does not include `aiApiKey`. This was checked explicitly rather than assumed: `.config` lists every key in `SETTABLE_KEYS`, and `.aistatus` was written to report only `yes`/`no` for whether a key is present. Neither can be made to print the key by any input, because the key is never in a table either of them reads from.

### 3. Seven listeners on one event (fixed, availability not confidentiality)

Every `messages.upsert` handler had its own `sock.ev.on(...)` call. Functionally this worked, but it meant a synchronous throw in one handler (before it reached its own try/catch — a bug, but the kind that happens) would abort delivery to every handler registered after it in the same call, including the command dispatcher. `src/handlers/messageBus.js` now wraps each subscriber individually, so one failing handler can't silently stop commands from working. Documented in the README under Phase 9.

### 4. No rate limiting beyond per-command cooldowns (fixed)

Per-command cooldowns stop spamming one command; they did nothing about cycling through many different commands as fast as possible. In a group that reads to WhatsApp as one number sending dozens of messages a minute — a fast route to the number getting flagged, independent of anything the messages actually say. `src/lib/rateLimiter.js` adds a 20-per-minute sliding window per sender with a temporary silent mute after repeated violations. Owners are exempt (see the note in `messageHandler.js` — a limiter that could lock the owner out mid-incident would be worse than no limiter).

### 5. `uncaughtException` no longer "log and continue" (fixed)

The original handler logged an uncaught exception and let the process keep running. Node's own guidance is not to do this: by the time an uncaught exception is caught at the process level, the stack has already unwound and any in-flight state (including, worst case, the Baileys auth/session state) may be inconsistent. The bot now exits on an uncaught exception and relies on a process supervisor (pm2, systemd, a container restart policy) to bring it back clean. This is a behavior change worth knowing about if you don't currently run one — see the note in `src/index.js`.

## Reviewed and found acceptable

- **All `spawn()` calls** (`ffmpegRunner.js`, `ocrRunner.js`, `ytdlpRunner.js`) pass arguments as an array, never through a shell (`shell: true` is not set anywhere). User-controlled values (URLs, filenames) flow in as individual array elements, not interpolated into a command string — so there's no shell-injection surface here even though these commands take user input.
- **Group admin checks fail closed.** `isSenderGroupAdmin`/`isBotGroupAdmin` in `groupPermissions.js` return `false` on any error fetching group metadata, rather than assuming admin status. An unreachable WhatsApp API means "no," not "yes."
- **Settings persistence is whitelisted.** `updateSetting()` only accepts keys present in `SETTABLE_KEYS`; there is no path from a `.config` command to writing an arbitrary key into `database/settings.json`.
- **Logs redact known-sensitive field names** (`REDACT_PATHS` in `logger.js`) before either the console or file transport, so accidental logging of a `token`/`password`/`apiKey`-named field doesn't leak it either.
- **Command dispatch dedups by message id** with a bounded, time-limited map, so WhatsApp's retry-redelivery behavior can't cause a command (e.g. `.kick`, `.warn`) to execute twice.

## Not fixed — flagged for you to decide, not defaults to trust

### Anti-delete and View Once unlocking are privacy-invasive by design

This is the one that matters most and is easiest to wave past, so it gets stated plainly rather than folded into a bullet list: **`.antidelete` and the View Once triggers exist specifically to capture things the other person chose to make temporary or to delete.** That's the entire feature. It is not a side effect or an edge case — it's what was asked for, and it's now built and working.

Nothing in the code can tell you whether using it on a specific person, in a specific relationship, is something they'd consent to if asked. That's not a technical question, and no amount of additional code changes that. Two things worth doing regardless of how you land on the ethics of it:

- Both features are owner-only and off by default (`antiViewOnce: false`, `antiDelete: false` in `config/index.js`) — someone has to deliberately turn them on.
- If you deploy this for anyone other than yourself, or in a jurisdiction with wiretapping/consent-recording laws, that's a legal question independent of anything in this codebase, and this audit is not legal advice.

### Secrets on disk

`.env` (API keys, in cleartext) and `auth/` (your WhatsApp session credentials — equivalent to a logged-in session token) are both gitignored, which stops them reaching a repository, but neither is encrypted at rest. Anyone with filesystem access to the machine running the bot can read both. If that's a real threat model for your deployment (shared hosting, a machine you don't fully control), that needs an OS-level answer — disk encryption, restrictive file permissions, a secrets manager — none of which this codebase provides or should try to.

### No input sanitization on things sent back to WhatsApp

Text the bot echoes back (e.g. `.rewrite`, `.ai` responses, `.echo`-like behavior anywhere it exists) is sent as-is. WhatsApp's own message rendering is the only thing standing between arbitrary user/model text and whoever reads it. This is normal for a chat bot and not something to "fix," but it means the bot is not a trust boundary — anyone who can get text into a prompt (including via `.ai`) can get roughly that text reflected back into the chat.

### Dependency vulnerabilities

This audit did not run `npm audit` or check CVEs against pinned versions in `package.json` — that requires network access this review didn't have. Run `npm audit` yourself before deploying, and periodically after.

### No automated tests

Everything in Phases 7-9 was manually exercised (see the test checklists in the README) but there is no test suite. A regression in, say, `checkRateLimit`'s window math would currently only be caught by someone noticing the bot behaving oddly under load, not by CI.

## If you find something

This is a personal bot project, not a maintained security-disclosure program — there's no bug bounty and no SLA. If you spot something here, the honest next step is just to fix it yourself and note what you changed, the same way this file does.
