# WA-Bot (Asheyrix) — Phases 1–9

A modular personal WhatsApp automation bot built on Baileys.

**Implemented so far:**
- Phase 1 — connection (QR/pairing), session persistence, auto-reconnect, command loader
- Phase 2 — owner system, permissions, runtime settings (`.config`), file logging
- Phase 3 — View Once unlocking (reply/react triggers), status view/react/save, anti-delete
- Phase 4 — downloaders (direct URL, YouTube, TikTok, Twitter/X, Facebook, SoundCloud, Instagram, Pinterest, MediaFire, Spotify metadata/search)
- Phase 5 — media tools (sticker, toimg, toaudio, tomp3, tomp4, gif, compress, qr, ocr)
- Phase 6 — group management (kick/add/promote/demote, tagall/hidetag, groupinfo/admins, link/revoke, mute/unmute, warn/warnings, anti-link, welcome/goodbye, admin-only mode)
- Phase 7 — AI system (multi-provider chat, vision, translate/summarize/explain/rewrite, per-chat memory)
- Phase 8 — tools and fun commands (calculator, encoding/hashing, password/UUID gen, profile lookups, dice/8ball/ship/etc.)
- Phase 9 — optimization (shared message bus, shared TTL cache), error handling, rate limiting, security audit, documentation

See [`docs/phase7-ai.md`](docs/phase7-ai.md), [`docs/phase8-tools-fun.md`](docs/phase8-tools-fun.md), and [`SECURITY.md`](SECURITY.md) for the newest phases in detail — this README covers setup and Phases 1–6 as before.

## Requirements

- Node.js 20 or newer
- A WhatsApp account you can link as a "linked device"
- **ffmpeg** on PATH — needed for YouTube audio extraction and video muxing
- **yt-dlp** on PATH — needed for every downloader except `.get` (direct URL) and `.mediafire`

### Installing ffmpeg, yt-dlp, and tesseract on Windows (PowerShell)

```powershell
winget install Gyan.FFmpeg
winget install yt-dlp.yt-dlp
winget install UB-Mannheim.TesseractOCR
```

Restart your terminal after installing so PATH updates take effect. The bot
checks for all three at startup and logs a warning (not a crash) if any are
missing — commands that need them will decline gracefully with a clear
message until you install them. `tesseract` is only needed for `.ocr`.

## Setup (PowerShell)

```powershell
cd wa-bot
npm install
Copy-Item .env.example .env
notepad .env
```

Edit `.env` and set at minimum:

- `OWNER_NUMBERS` — your own number, digits only, international format (e.g. `2348012345678`)
- `BOT_MODE` — leave as `private` for now (only you can use commands)
- `LOGIN_METHOD` — `qr` (default) or `pairing`
- `PAIRING_NUMBER` — only needed if `LOGIN_METHOD=pairing`

## Running

```powershell
npm start
```

### Logging in via QR (default)

1. Run `npm start`.
2. A QR code prints in your terminal.
3. On your phone: WhatsApp → Settings → Linked Devices → Link a Device → scan it.
4. On success you'll see `WhatsApp connection established.` in the logs.

### Logging in via pairing code

1. Set `LOGIN_METHOD=pairing` and `PAIRING_NUMBER=<your number>` in `.env`.
2. Run `npm start`.
3. A pairing code prints in the terminal.
4. On your phone: WhatsApp → Settings → Linked Devices → Link a Device → "Link with phone number instead" → enter the code.

Your session is saved in `auth/` so you won't need to re-scan on future
restarts, unless you log out from the phone or delete that folder.

## Test checklist

- [ ] `npm install` completes with no errors
- [ ] `npm start` prints a QR code (or pairing code) with no crash
- [ ] Linking succeeds and logs show "WhatsApp connection established."
- [ ] Stop the bot (Ctrl+C) and start it again — it reconnects **without** asking you to scan again
- [ ] From WhatsApp, send `.ping` to yourself (or the linked number) — bot replies with "Pinging..." then "Pong! Nms"
- [ ] Send `.menu` — bot replies with a categorized list containing `ping` and `menu`
- [ ] Send a nonsense command like `.doesnotexist` — bot stays silent, does **not** crash or error
- [ ] Turn off Wi-Fi/network briefly, then restore it — bot reconnects on its own
- [ ] Set `BOT_MODE=private` and confirm a **different** WhatsApp number gets no response to `.ping`

## Phase 2 — owner system & settings

- `.config` (owner only) — view/change runtime settings without touching `.env` or restarting
- Settings persist to `database/settings.json` (gitignored — it's runtime state)
- Logs write to `logs/<date>.log` in addition to the console

Test:
- [ ] `.config prefix !` then `!ping` works immediately, no restart
- [ ] `.config botMode nonsense` is rejected with a clear message
- [ ] Restart the bot — changed settings are still in effect
- [ ] Non-owner sending `.config` gets the owner-only rejection message

## Phase 3 — Privacy, View Once, Status, Anti-delete

**Important limitations, stated plainly:**
- View Once unlocking is owner-only and always delivers to your own DM, never back into the chat the media came from. Two triggers exist, and they are *not* equally reliable:
  - Reply **`waw`** (configurable via `VIEW_ONCE_TRIGGER_WORD`) directly to the View Once message. A reply carries the full quoted message, decryption key included, so this works every time.
  - React **👀** (configurable via `VIEW_ONCE_TRIGGER_EMOJI`) to it. A reaction carries only the target's message id, no content — so this only works if the bot already cached that message when it first arrived, and WhatsApp's June 2024 protocol change means it often withholds the decryption key on that first delivery. Treat the emoji as a convenience and `waw` as the trigger that always works.
- `.antiviewonce on` additionally auto-forwards every View Once message to the owner as it arrives, without needing either trigger — same DM-only delivery.
- Anti-delete only recovers messages the bot cached **before** deletion, within a 15-minute window. A message deleted after that window, or one sent before `.antidelete on` was enabled, is not recoverable.
- Status auto-react depends on WhatsApp's status-broadcast protocol, which has changed across app versions — if it silently stops working, that's usually a WhatsApp-side protocol change, not a bug you can fix by restarting.

Commands (all owner-only):
| Command | Effect |
|---|---|
| `.antiviewonce on/off` (alias `.avo`) | Auto-forward every View Once message to owner as it arrives |
| `.antidelete on/off` (alias `.ad`) | Recover deleted messages, forward to owner |
| `.statusview on/off` | Auto-mark contacts' statuses as viewed |
| `.statusreact on/off` or `.statusreact ❤️` | Auto-react to statuses; setting an emoji also turns reactions on |
| `.statussave on/off` | Auto-forward status media/text to the owner |

Plus the two prefix-less triggers described above: reply `waw`, or react 👀, to any View Once message.

Test:
- [ ] Reply `waw` to a View Once photo/video/voice note — you receive it in your own DM, nothing appears in the original chat
- [ ] React 👀 to a recent (< 30 min old) View Once message — same result, or a DM explaining why it couldn't
- [ ] `.avo on`, then have someone send you a View Once photo/video without you reacting/replying — you receive a forwarded copy automatically
- [ ] `.ad on`, send a test message from another chat, delete it for everyone — you receive a "Deleted message recovered" copy
- [ ] `.statusview on` — a contact's status shows as viewed by you without opening WhatsApp
- [ ] `.statusreact ❤️` — bot auto-reacts to the next status it sees
- [ ] `.statussave on` — a contact's status media/text shows up forwarded to your own chat
- [ ] Turn all four off — confirm none of the behavior continues

## Phase 4 — Downloaders

| Command | Source | Needs yt-dlp? |
|---|---|---|
| `.get <url>` (alias `.download`) | Any direct file URL | No |
| `.ytmp3` / `.ytmp4 <url>` | YouTube | Yes (+ ffmpeg) |
| `.tiktok <url>` (alias `.tt`) | TikTok | Yes |
| `.twitter <url>` (alias `.x`) | Twitter/X | Yes |
| `.fb <url>` (alias `.facebook`) | Facebook | Yes |
| `.soundcloud <url>` (alias `.sc`) | SoundCloud | Yes |
| `.ig <url>` (alias `.instagram`) | Instagram (public posts/reels only) | Yes |
| `.pinterest <url>` (alias `.pin`) | Pinterest | Yes |
| `.mediafire <url>` (alias `.mf`) | MediaFire | No |
| `.spotify <url or query>` (alias `.sp`) | Spotify metadata, or search if API keys set | No |

**Honest caveats:**
- Instagram/Pinterest support depends entirely on yt-dlp's current extractor coverage for those sites, which shifts as those platforms change their APIs. Public content usually works; private or heavily rate-limited content may fail with a clear error.
- Spotify audio is never downloaded — only metadata (title, thumbnail) via Spotify's public oEmbed, and optional search via the official Web API if you add `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`. This bot does not and will not bypass Spotify's DRM.
- All downloads are capped at `MAX_DOWNLOAD_MB` (default 50MB) and aborted mid-stream if exceeded. Files are always deleted from `temp/` after being sent, success or failure.

Test:
- [ ] `.get <some small direct file URL>` — file arrives, `temp/` is empty afterward
- [ ] `.ytmp3 <a short youtube video>` — mp3 arrives (fails clearly if yt-dlp/ffmpeg not installed, doesn't crash)
- [ ] `.ytmp4 <same video>` — video arrives, capped at 480p
- [ ] `.tiktok <a tiktok link>` — video arrives
- [ ] Try `.tiktok <a youtube link>` — rejected with "not from a supported domain," not a crash
- [ ] `.spotify <a spotify track link>` — returns title + thumbnail, no audio
- [ ] Without `SPOTIFY_CLIENT_ID` set, `.spotify shape of you` (a text query) — clear message that search needs API credentials
- [ ] `.get <url to a file bigger than MAX_DOWNLOAD_MB>` — rejected before fully downloading, not left half-downloaded in `temp/`

## Phase 5 — Media tools

All of these operate on media you **reply to** (or attach directly with the command as a caption).

| Command | Effect | Needs |
|---|---|---|
| `.sticker` (`.s`) | Image/short video → sticker | ffmpeg |
| `.toimg` (`.img`) | Sticker → image | ffmpeg |
| `.toaudio` (`.ta`) | Video → audio (original quality, aac) | ffmpeg |
| `.tomp3` (`.mp3`) | Video/audio → mp3 | ffmpeg |
| `.tomp4` (`.mp4`) | Video (mov/webm/mkv) → mp4 | ffmpeg |
| `.gif` | Short video → looping gif-style clip | ffmpeg |
| `.compress` (`.cmp`) | Reduce image/video file size | ffmpeg |
| `.qr` | Text/link → scannable QR image | nothing extra |
| `.ocr` | Image → extracted text | tesseract |

**Note on `.gif`:** WhatsApp doesn't render standalone `.gif` files well — like every other WA bot, this sends a short looping mp4 with the `gifPlayback` flag, which WhatsApp autoplays like a gif. That's a WhatsApp platform limitation, not a shortcut we took.

Test:
- [ ] Reply to a photo with `.sticker` — sticker arrives
- [ ] Reply to that sticker with `.toimg` — image arrives
- [ ] Reply to a short video with `.gif` — looping clip arrives
- [ ] Reply to a video with `.tomp3` — mp3 arrives
- [ ] `.qr https://example.com` — QR image arrives, scans correctly with your phone's camera
- [ ] Reply to a photo containing text with `.ocr` — extracted text arrives
- [ ] Without ffmpeg installed, try `.sticker` — clear "ffmpeg is not installed" message, not a crash

## Phase 6 — Group management

Group-action commands (`.kick`, `.add`, `.promote`, `.demote`, `.tagall`, `.hidetag`, `.link`, `.revoke`, `.mute`, `.unmute`, `.warn`, `.warnings`) require the sender to be a **group admin** (or the bot owner, who always passes). `.groupinfo` and `.admins` are open to everyone. The bot must be a group admin itself for anything that changes group state (kick/add/promote/demote/link/revoke/mute/unmute) — if it isn't, you'll get a clear error instead of a silent failure.

| Command | Effect |
|---|---|
| `.kick` (mention/reply) | Removes a member |
| `.add <number>` | Adds a member |
| `.promote` / `.demote` (mention/reply) | Admin status |
| `.tagall [message]` | Mentions everyone |
| `.hidetag <message>` (`.ht`) | Notifies everyone without listing them |
| `.groupinfo` (`.gi`) | Group name/description/member+admin counts |
| `.admins` | Lists current admins |
| `.link` / `.revoke` | Invite link management |
| `.mute` / `.unmute` | WhatsApp's native "only admins can message" toggle |
| `.warn` (mention/reply) `[reason]` | Records a warning |
| `.warnings` (mention/reply) `[clear]` | Shows or clears warning history |
| `.antilink on/off` (`.al`) | Auto-deletes WhatsApp group-invite links from non-admins |
| `.welcome on/off` | Greets new members |
| `.goodbye on/off` | Announces members leaving |
| `.adminmode on/off` (`.am`) | When on, only admins can use **any** bot command in that group (owner always exempt) |

**Honest scope note:** `.antilink` specifically targets `chat.whatsapp.com/...` invite links (the conventional meaning — stopping people advertising other groups), not a general URL ban. Kicking after repeated warnings is **not** automatic — `.warn`/`.warnings` just track a count; you decide when to `.kick`.

Test:
- [ ] `.groupinfo` and `.admins` work for any member
- [ ] Non-admin tries `.kick` — rejected with "restricted to group admins"
- [ ] Admin uses `.kick` on a test account — member removed
- [ ] `.antilink on`, have a non-admin post a `chat.whatsapp.com` link — message deleted, warning issued
- [ ] `.welcome on`, add a test member — greeting posted
- [ ] `.adminmode on`, non-admin tries `.ping` — silently ignored; admin's `.ping` still works
- [ ] `.warn` a test member twice, then `.warnings` — shows both entries; `.warnings ... clear` resets it

## Phase 7 — AI system

Full writeup: [`docs/phase7-ai.md`](docs/phase7-ai.md). Summary:

One AI backend, six providers (`anthropic`, `openai`, `gemini`, `groq`, `openrouter`, `deepseek`, or `custom` for any OpenAI-compatible endpoint — Ollama, LM Studio, vLLM). Set `AI_PROVIDER` and `AI_API_KEY` in `.env`, then `.aichat on`.

| Command | Effect |
|---|---|
| `.ai <question>` (aliases `.gpt` `.ask` `.chat`) | Chat with the AI. Remembers recent turns per chat+sender. Reply to an image with it to ask about the image (vision-capable providers only). |
| `.translate <language> <text>` (`.tr`) | Translate; reply to a message to translate it |
| `.summarize <text>` (`.sum`, `.tldr`) | Bullet-point summary |
| `.explain <topic>` (`.eli5`) | Plain-language explanation |
| `.grammar <text>` | Fixes spelling/grammar, keeps your voice |
| `.rewrite <tone> <text>` | Rewrites in a different tone |
| `.aiclear [all]` | Clears your conversation history (owner: `all` clears everyone's) |
| `.aistatus` (owner) | Shows provider/model/readiness — never prints the API key |
| `.aipersona <instructions>` (owner) | Sets the system prompt; `reset` restores default |
| `.aichat on/off` (owner) | Master AI switch |
| `.aiauto on/off` (owner) | Prefix-less replies in DMs |

Mentioning the bot (`@botnumber`) or replying to one of its own messages triggers a reply in **any** chat, including groups, regardless of `.aiauto` — that's an unambiguous address, unlike a bare message in a group.

**Honest caveats:**
- Conversation memory is in-process only. A restart clears everyone's history — deliberate, since it's private chat content and shouldn't outlive the process into a backup.
- Vision only works with providers that support it (Anthropic, OpenAI, Gemini, OpenRouter — not Groq or DeepSeek at time of writing). Attaching an image to an unsupported provider gets a clear error, not a silent text-only fallback.
- `AI_API_KEY` is read from `.env` only. It is deliberately excluded from `database/settings.json` and from anything `.aistatus`/`.config` can print, so it can never end up in a chat transcript.

Test:
- [ ] `.aistatus` before setting `AI_API_KEY` — reports not-ready with a clear reason
- [ ] Set `AI_API_KEY`, `.aichat on`, `.ai hello` — get a reply
- [ ] Reply to a photo with `.ai what is this` (Anthropic/OpenAI/Gemini/OpenRouter) — get a description
- [ ] `.aiclear` then ask something that depends on earlier context — bot has no memory of it
- [ ] `.aiauto on` in a DM, send a message with no prefix — bot replies
- [ ] In a group with `.aiauto off`, send a plain message — bot stays silent; @-mention the bot — it replies

## Phase 8 — Tools and fun

Full writeup: [`docs/phase8-tools-fun.md`](docs/phase8-tools-fun.md). Summary:

**Tools:** `.calc`, `.encode`/`.decode` (base64), `.hash` (md5/sha1/sha256/sha512), `.morse`, `.binary`, `.reverse`, `.mock`, `.fancy` (unicode styled text), `.password`, `.uuid`, `.pp` (profile picture), `.whois` (JID lookup), `.stats` (uptime/memory/command count).

**Fun:** `.dice` (`NdM` notation), `.coinflip`, `.8ball`, `.choose`, `.rate`, `.ship`, `.joke`, `.fact`, `.truth`, `.dare`, `.compliment`.

`.calc` is a hand-written parser (no `eval`) — see [`docs/phase8-tools-fun.md`](docs/phase8-tools-fun.md) for why that matters here specifically. `.rate` and `.ship` are seeded from the subject's identity so the result is stable rather than re-rollable.

Test:
- [ ] `.calc (2+3)*4` → 20; `.calc 1/0` → clear division-by-zero message, not a crash
- [ ] `.calc process.exit()` and `.calc constructor` → both rejected as unknown, bot keeps running
- [ ] `.encode hello` then `.decode <result>` round-trips to `hello`
- [ ] `.password 32` → 32-character password; `.uuid 3` → three UUIDs
- [ ] `.dice 2d6` → two dice, shows both rolls and the total
- [ ] `.rate something` twice → same score both times
- [ ] `.pp` on someone with a hidden/absent picture → clear message, not an error dump

## Phase 9 — Optimization, error handling, security, docs

Full writeup: [`SECURITY.md`](SECURITY.md). Summary of what changed under the hood — nothing here adds a command, it changes how the existing ones behave:

- **One message listener instead of seven.** `src/handlers/messageBus.js` replaces per-handler `sock.ev.on('messages.upsert', ...)` calls with a single subscription, fanned out by name. A handler throwing synchronously no longer starves the handlers registered after it, and reconnects replace a subscriber instead of stacking a duplicate.
- **One TTL cache implementation instead of three.** `src/utils/ttlCache.js` replaces the hand-rolled prune logic that anti-delete, View Once caching, and message dedup had each grown independently.
- **Central error handling.** `src/lib/errorHandler.js` — commands throw `UserFacingError` for messages safe to show verbatim; everything else becomes a short reference code in the chat and a full stack trace in the log, never the reverse.
- **Per-sender rate limiting.** `src/lib/rateLimiter.js` — 20 commands/minute per sender on top of existing per-command cooldowns, with a silent temporary mute after repeated flooding. Owners are exempt. This exists to protect the bot's WhatsApp account from being flagged for spam-like behavior, not to punish users.
- **Graceful shutdown.** `SIGINT`/`SIGTERM` now flush logs before exiting; an uncaught exception exits (for a supervisor to restart cleanly) instead of limping on with potentially corrupted session state.
- **Security audit fixes** — see [`SECURITY.md`](SECURITY.md) for the full list, including the calculator's prototype-chain hole (closed) and why `AI_API_KEY` is excluded from `.config`.

Test:
- [ ] Send 25 commands in under a minute from a non-owner account — the first ~20 succeed, then a rate-limit notice, then silence
- [ ] As the owner, do the same — no rate limiting applies
- [ ] Force a command to throw (temporarily break one) — chat gets a short reference code, `logs/` has the full trace with matching id
- [ ] `Ctrl+C` the bot — "Shutting down..." appears in the log before it exits
- [ ] Reconnect the bot (toggle network) — `.ping` still gets exactly one reply, not two

## Project structure

```
src/
  index.js                    entry point
  config/index.js             loads & validates .env, holds defaults
  connection/connection.js    Baileys socket, QR/pairing, reconnect
  handlers/
    commandLoader.js          recursively loads commands/*
    messageBus.js              single messages.upsert listener, fanned out to named subscribers
    messageHandler.js         parses messages, permissions/cooldowns/dedup/rate-limit, dispatches
    viewOnceHandler.js         auto-capture (.antiviewonce) + always caches for the reaction trigger
    viewOnceTriggerHandler.js  the "waw" reply and 👀 reaction triggers, DM-only delivery
    antiDeleteHandler.js       caches messages, recovers deleted ones -> owner
    statusHandler.js           status view/react/save
    groupEventsHandler.js      welcome/goodbye on group-participants.update
    groupModerationHandler.js  anti-link detection + deletion
    aiChatHandler.js           prefix-less AI replies (DM auto-reply / @-mention / reply-to-bot)
  commands/
    tools/ping.js, menu.js, uptime.js, owner.js, lookup.js (pp/whois/stats), textTools.js
    owner/config.js            runtime settings command
    privacy/                   antiviewonce, antidelete, statusview, statusreact, statussave
    downloader/                get, youtube, tiktok, twitter, fb, soundcloud, ig, pinterest, mediafire, spotify
    media/                     sticker, toimg, toaudio, tomp3, tomp4, gif, compress, qr, ocr
    group/                     kick, add, promote, demote, tagall, hidetag, groupinfo, admins,
                                link, revoke, mute, unmute, warn, warnings, antilink, welcome,
                                goodbye, adminmode
    ai/                        ai, tasks (translate/summarize/explain/grammar/rewrite),
                                aicontrol (aiclear/aistatus/aipersona), aitoggles (aichat/aiauto)
    fun/                       dice, coinflip, 8ball, choose, rate, ship, joke, fact, truth, dare, compliment
  services/
    ai/
      index.js                  single ask() entry point; provider registry; timeout/vision guards
      conversation.js            per-chat, per-sender in-memory history
      errors.js                  AiError family — messages are always safe to show the user
      providers/                 anthropic.js, gemini.js, openaiCompatible.js (covers openai/groq/openrouter/deepseek/custom)
    downloaders/
      direct.js                generic direct-URL downloader (built-in https, no deps)
      ytdlpRunner.js            shared yt-dlp process wrapper (timeout, size cap, cleanup)
      ytdlpProviderFactory.js   builds a provider from a domain list + format flags
      youtube.js, tiktok.js, twitter.js, facebook.js, soundcloud.js,
      instagram.js, pinterest.js   thin yt-dlp-backed providers
      mediafire.js              HTML scrape + direct.js
      spotify.js                oEmbed metadata + optional Web API search
      index.js                  provider registry / auto-detect
      tempFile.js               unique temp paths + cleanup
      errors.js                 DownloaderError with a `.code`
    media/
      ffmpegRunner.js           shared ffmpeg process wrapper
      ocrRunner.js              shared tesseract process wrapper
      errors.js                 MediaError with a `.code`
  database/
    settingsStore.js            JSON-backed runtime settings (whitelisted keys only)
    warningsStore.js             JSON-backed group warning history
  lib/
    ownerNotify.js               connect notification
    toggleCommand.js             factory for on/off privacy/group commands
    downloadCommandHelper.js     send+cleanup+error-translation for downloader commands
    mediaCommandHelper.js        resolve target media + run ffmpeg + send + cleanup
    aiCommandHelper.js            shared AI-command glue: history, image attach, chunking
    safeCalculator.js             .calc's parser — no eval, no prototype-chain lookups
    errorHandler.js               UserFacingError, describeError, safeSend, withRetry
    rateLimiter.js                per-sender sliding-window limiter + temporary mute
    viewOnceDelivery.js            shared download+DM-delivery for both View Once triggers
    getTargetMedia.js             finds media attached or replied-to
    getTargetParticipant.js       finds @mentioned or replied-to group member
    diagnostics.js                startup check for ffmpeg/yt-dlp/tesseract
  utils/
    logger.js                    pino logger, console + file, redacts secrets
    ttlCache.js                   shared TTL + size-bounded cache (dedup, anti-delete, View Once)
    viewOnceCache.js               View Once-specific wrapper around ttlCache, for the 👀 trigger
    jid.js, permissions.js, groupPermissions.js, messageContent.js
  data/
    funContent.js                 local joke/fact/truth/dare/compliment lists
auth/                            session credentials (gitignored)
database/*.json                  runtime settings + warnings (gitignored)
logs/                             daily log files (gitignored)
temp/                             download/conversion scratch space, always cleaned up (gitignored)
assets/                           put your .menu banner image here
docs/                             phase7-ai.md, phase8-tools-fun.md — deeper writeups
SECURITY.md                       audit findings, fixes, and what's still on you
```
