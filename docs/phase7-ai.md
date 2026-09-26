# Phase 7 — AI system

## How it fits together

```
command (.ai, .translate, ...)
        │
        ▼
lib/aiCommandHelper.js    — builds the prompt, attaches an image if there's one to grab,
        │                    pulls/writes conversation history, chunks long replies
        ▼
services/ai/index.js      — the ONLY place that picks a provider and calls it. Enforces
        │                    the timeout, the vision-capability check, and turns any
        │                    provider-specific failure into an AiError with a safe message.
        ▼
services/ai/providers/*   — one file per wire format. anthropic.js and gemini.js are
                             genuinely different APIs; openaiCompatible.js covers OpenAI,
                             Groq, OpenRouter, DeepSeek, and `custom` because they all speak
                             the same /v1/chat/completions dialect.
```

Nothing above `services/ai/index.js` knows which provider is configured. Nothing below `aiCommandHelper.js` knows it's talking to WhatsApp. That's the seam to keep respecting if you add a command or a provider — nothing else should need to change.

## Adding a provider

Write a `send()` function matching the contract at the top of `providers/anthropic.js`, add one entry to the `PROVIDERS` object in `services/ai/index.js`, done. If it's OpenAI-compatible, you don't even need a new file — add an entry pointing at `openaiCompatible.send` with the right `baseUrl` and `defaultModel`.

## Why conversation history is in-memory only

`services/ai/conversation.js` never touches disk. Two reasons, and either one alone would be enough:

1. It's private conversation content. Writing it to `database/` puts it in the blast radius of anything that reads that folder — including, eventually, whatever backs up your server.
2. A restart clearing everyone's context is a *feature*, not a gap. Stale context from three days ago silently biasing today's answer is worse than starting fresh.

History is scoped by chat **and** sender (`chatJid::senderJid`), so two people talking to the bot in the same group get separate threads. In a DM the two collapse together, which is what you'd want.

## Why images are never stored in history

Only the text of each turn is remembered — not the base64 image data. Keeping images across turns would balloon memory for a benefit the model has usually already captured in its own reply text. If you need the model to reference an image again, reply to it (or resend it) with a new question.

## The timeout

Every call gets `AI_TIMEOUT_SECONDS` (default 60) before the request is aborted. This isn't cosmetic — Baileys' `messages.upsert` handler that triggers an AI command is one of several concurrent subscribers on the message bus (see Phase 9). A hung fetch that never resolves would leak an unresolved promise per stuck request; with a hard abort, the worst case is "one slow reply," never "the bot slowly stops responding to anything."

## Vision support

| Provider | Vision |
|---|---|
| anthropic | yes |
| openai | yes |
| gemini | yes |
| openrouter | yes (model-dependent, most default vision-capable ones work) |
| groq | no |
| deepseek | no |
| custom | assumed yes — you're on your own to confirm your endpoint supports it |

Attaching an image on a non-vision provider raises a clear `AiError` before any network call is made, rather than silently dropping the image and answering the text alone (which is a different answer to a different question — the person asked about a picture).

## Error messages are curated, not passed through

Every provider adapter catches upstream failures and reduces them to one of a small set of `AiError` subclasses (`AiAuthError`, `AiRateLimitError`, `AiTimeoutError`, plain `AiError`). None of them forward the raw response body. This matters because provider error payloads routinely echo back request details — and in more than one real-world case, provider APIs have echoed the request headers (including the auth header) into error bodies on malformed requests. Whether or not a given provider does that today, treating every upstream error as untrusted is cheap insurance and the code doesn't need to know which providers are currently safe to trust with that.

## What `.aistatus` deliberately omits

It reports whether a key is set (`yes`/`no`), never the key or any prefix of it. Owners run status checks in shared chats and screenshots more than they think about when they do it.

## Known rough edges

- No streaming — a reply is sent in full once the provider finishes, not token-by-token. On a slow model this can be a 10-20 second wait with only WhatsApp's "typing..." indicator as feedback.
- No per-user model override — everyone in a chat shares the persona set by `.aipersona` and the model set in `.env`/`.config`. There's no `.ai --model=x` escape hatch.
- Rate limits from the provider surface as "try again in a moment" with no visibility into remaining quota — providers don't consistently expose that in a way worth parsing.
