# Phase 8 — Tools and fun

## `.calc` doesn't use `eval`, and here's why that's not optional

`.calc` takes free-form text from anyone who can message the bot — in a public group, that's anyone. `eval()` (or `new Function()`) on attacker-controlled text, run inside a process that also holds your live WhatsApp session, is close to the worst possible combination: `.calc process.exit()` is the friendly failure mode, and `.calc require('fs').readFileSync('./auth/creds.json')` is the one that matters.

`src/lib/safeCalculator.js` is a small recursive-descent parser instead: tokenize, build an expression tree, evaluate it. The grammar can only ever produce a number — there is no code path that reaches a JS function call the parser didn't put there itself.

Two things surfaced during testing that are worth knowing about if you extend it:

1. **A bare `x` for multiplication had to be special-cased in the tokenizer**, not the operator table, because the identifier-scanning rule runs first and would otherwise swallow it as a function name.
2. **`FUNCTIONS` and `CONSTANTS` are `Object.create(null)`, not plain object literals.** With a normal `{}`, `FUNCTIONS['constructor']` resolves up the prototype chain to `Object`'s own constructor — so `.calc constructor(1)` passed the "is this a known function name" check and actually invoked something nobody put in the table. It only produced `NaN` in testing, but a lookup table fed directly by user input should never be able to return anything that wasn't explicitly added to it. `toString`, `valueOf`, and friends have the same issue and are closed by the same fix.

If you add functions to `FUNCTIONS`, they stay safe automatically — the null-prototype object has no inherited properties to leak, and the parser never does anything with a resolved value except call it as `fn(number)`.

## `.password` and `.uuid` use `crypto.randomInt`, not `Math.random`

`Math.random()` is not cryptographically secure and, more immediately relevant here, `Math.random() * n | 0` has modulo bias — some outputs are very slightly more likely than others. For a password generator that's a real weakness, however small; `crypto.randomInt` is rejection-sampled and has none. Every command in this phase that needs randomness (dice rolls included) goes through the same helper for consistency, even where the bias would be cosmetically irrelevant.

## Why `.rate` and `.ship` are deterministic

Both hash their input (`sha256`, first two bytes mod 100) instead of rolling fresh each time. A `.rate` that gives a different number every run is just noise — a deterministic one that always says the same thing about the same input is a stable joke people can reference later, and it can't be gamed by re-running the command until you get the number you want. `.ship` additionally sorts the two names before hashing, so `.ship A and B` and `.ship B and A` agree.

## Fun content is a local file, not an API call

`src/data/funContent.js` holds the joke/fact/truth/dare/compliment lists directly. The alternative — one of the free joke/fact APIs — has three problems at once: it goes down independently of your bot, you don't control its content moderation, and it adds a network round-trip to a command that should be instant. A fixed list sidesteps all three. Add to the arrays freely; there's no format beyond "string in an array."

## `.pp` and privacy settings

WhatsApp returns the same generic error for "this person has no profile picture" and "this person has hidden their picture from you." `.pp` can't tell those apart and doesn't pretend to — the message says exactly that rather than guessing.

## `.stats` and what it doesn't show

`.stats` reports process uptime, heap/RSS memory, Node version, loaded command count, and bot mode. It's owner-facing operational info, not a WhatsApp analytics dashboard — it can't tell you message volume, active chats, or anything WhatsApp itself doesn't expose to a linked device.
