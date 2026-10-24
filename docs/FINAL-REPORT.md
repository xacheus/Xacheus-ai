# VOICEPILOT AI — implementation report

**Date:** 2026-10-24 · **Branch:** `arena/e971e72c-xacheus-ai` · **Stack:** Next.js 15, TypeScript, Tailwind, Firebase
(Auth/Firestore/App Check), Firebase Admin, Groq (Whisper + chat), Twilio adapter (disabled)

The repository contained only a stub README, so the application was built from the ground up on the provided Firebase
project `xacheus-ai`, its supplied web configuration, and a server-only Groq integration.

---

## 1. Features successfully implemented

### Platform and security

- Firebase Auth: email/password registration, sign-in, password reset, email verification with resend, optional Google
  provider (graceful error if not enabled), session persistence via `onAuthStateChanged`.
- Server-side ID-token verification on every protected API route, with revocation checks.
- Ownership isolation for agents, workspaces, call records and usage (`users/{uid}/...`, `workspaces/{uid}`,
  `calls.ownerId`); foreign resources return 404.
- Firestore security rules: clients are read-only, owner-scoped; admin reads require a verified `admin` custom claim;
  all unmatched paths denied. Storage rules deny everything.
- Administrator rights only through a server-set custom claim, with `scripts/set-admin.mjs` to grant/revoke.
- Zod validation for every request body; multipart audio validation (type, extension, emptiness, 25 MB cap).
- Per-user rate limits before provider calls (transcription 30/h, chat 120/h, agent writes, outbound calls 5/h).
- Normalised error envelope with request IDs; 5xx failures logged to `systemErrors` without provider payloads.
- CSP and security headers; no provider secret present in client bundles (verified).
- Optional App Check integration (client + server enforcement flag).

### AI agent builder

- Full agent model: name, purpose, business name, personality, speaking style, system instructions, language,
  voice provider/voice ID, speaking rate, welcome message, FAQs, business knowledge, call-handling instructions,
  transfer instructions and number, business hours, activation status.
- Create/edit/delete/deactivate with server-enforced plan limits (Starter = 1 agent).
- Multi-step, mobile-friendly editor with FAQ editor, validation and save state.

### Speech-to-text and conversations

- `POST /api/transcribe`: authenticated, rate-limited, quota-checked, format/size-validated, in-memory audio forwarded
  to Groq Whisper `whisper-large-v3-turbo` with `verbose_json`; returns text, detected language, duration, model and
  charged seconds. Audio is never persisted.
- Voice lab: microphone recording (`MediaRecorder`) with permission error handling, file upload with preview, language
  selection, loading states, transcript editing, copy, clear, retry, word count and provider metadata.
- `POST /api/chat`: guarded system prompt (facts only, never invent prices/policies/availability, admit unknowns and
  offer human handoff, no sensitive-data requests, spoken-length replies), usage-metered, agent-ownership checked.
- Browser test conversation: message history, speech synthesis with per-agent language/rate, barge-in (cancel
  playback), session reset/end, 40-turn cap, state machine (`idle → listening → transcribing → thinking → speaking`).
- Explicit labelling everywhere that test conversations are **not** telephone calls.

### Business workspace, usage and administration

- Workspace editor: business name/description, contact email/phone, website, timezone, hours, products/services,
  appointment instructions, escalation contact, company-wide FAQs.
- Dashboard: agents, active agents, test turns, transcriptions, estimated cost, telephony status, onboarding checklist,
  recent activity — all from real records with empty states.
- Usage & plan page: monthly meters for STT minutes, test turns, call minutes and agents; cost estimate; plan comparison;
  clear "no payment provider connected" messaging.
- Call history: table/cards, filters, detail dialog (status, duration, outcome, failure reason, transcript, summary),
  per-record deletion, and an explicit inactive-state panel listing the four prerequisites for telephony.
- Settings: profile, verification, password reset, retention preference, data-handling explanation, session sign-out.
- Admin dashboard: platform counts, plan distribution, month usage aggregates, provider checklist (presence only),
  live Groq model verification, agent moderation, user directory with plan assignment, recent errors, audit logging.
- Plan catalogue and prices fully configurable through environment/JSON; enforced limits on the server only.

## 2. Features tested successfully

- **47 automated tests pass** (`npm test`): prompt grounding/guardrails, response sanitisation, conversation state
  machine incl. barge-in/timeouts/termination, Twilio signature vector + TwiML + webhook URL resolution, request
  validation incl. E.164/consent/retention/audio files, rate limiting, plan limits and pricing maths, and the Groq
  client's request shape plus error mapping (401/429/empty/timeout) against a stubbed `fetch`.
- **TypeScript strict check passes**; **production build passes** (14 pages, 18 API routes).
- **API contract checks** executed on the production build: all protected endpoints return 401 without a token;
  forged tokens return 401; the voice webhook returns 503 while unconfigured; `/api/status` and `/api/health` expose
  capability booleans only; wrong-method requests return 405; CSP/security headers present.
- **Secret scan**: no `gsk_`, private keys or provider secrets in `.next/static`; only variable *names* appear in UI copy.
- **Not tested:** anything requiring live Firebase, Groq or Twilio credentials, and visual browser testing (no browser
  binary in this environment). See `docs/TESTING.md` for the exact manual plan.

## 3. Required environment variables

| Variable | Required | Scope | Used for |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` … `APP_ID` | Yes (defaults baked in) | Public | Firebase web SDK on `xacheus-ai` |
| `FIREBASE_SERVICE_ACCOUNT_KEY` (or `_FILE`) | **Yes** | Server | Token verification, agent/workspace writes, usage metering, calls, admin APIs |
| `GROQ_API_KEY` | **Yes for AI** | Server | Whisper + chat |
| `GROQ_TEXT_MODEL` | No | Server | Default `openai/gpt-oss-120b` |
| `GROQ_WHISPER_MODEL` | No | Server | Default `whisper-large-v3-turbo` |
| `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` | No | Public | App Check |
| `APP_CHECK_ENFORCE` | No | Server | Require App Check tokens on API routes |
| `RATE_LIMIT_TRANSCRIBE_PER_HOUR`, `RATE_LIMIT_CHAT_PER_HOUR` | No | Server | Override defaults 30 / 120 |
| `STARTER_AGENTS`, `STARTER_TRANSCRIPTION_SECONDS`, `STARTER_CHAT_REQUESTS`, `PLAN_CONFIG_JSON` | No | Server | Plan overrides |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_WEBHOOK_BASE_URL` | No | Server | Calling (disabled until all set) |
| `VOICE_STREAM_URL`, `TELEPHONY_CALLING_ENABLED` | No | Server | Media gateway + explicit activation |

Run `node scripts/doctor.mjs` (optionally `--live`) to check all of these without printing secrets.

## 4. Manual configuration still needed

1. **Firebase Auth**: enable Email/Password (and Google if wanted); add every hostname (localhost, preview host,
   production domain) to *Authorized domains*; customise email templates.
2. **Firestore**: create the database (production mode), then `firebase deploy --only firestore:rules,firestore:indexes`
   with the CLI. Without this, clients cannot read agents/calls and you will see permission errors in the UI.
3. **Service account**: generate a key and set `FIREBASE_SERVICE_ACCOUNT_KEY` on the server. Until then, agent creation
   and metering are blocked by design and the UI/API says so.
4. **Groq**: create an API key, set `GROQ_API_KEY`, and confirm `whisper-large-v3-turbo` and `openai/gpt-oss-120b` are
   available on your account (`npm run doctor -- --live`).
5. **First admin**: `node scripts/set-admin.mjs you@example.com`, then sign out and in.
6. **App Check** (recommended): register reCAPTCHA v3, set the site key, verify traffic, then enforce.
7. **Telephony** (optional): verify a Twilio account, confirm number availability and destination rates for your
   countries, deploy the websocket media gateway, set `VOICE_STREAM_URL`, test one number end-to-end, and only then set
   `TELEPHONY_CALLING_ENABLED=true`.
8. **Payments** (optional): choose a provider (e.g. Stripe) and implement checkout/webhooks before charging anyone.
9. **Hosting**: set server variables in your host; keep `maxDuration` ≥ 120 s for transcription if self-hosting.

## 5. Features requiring paid providers

| Capability | Provider | Note |
| --- | --- | --- |
| Whisper transcription | Groq (paid beyond free-tier limits) | $0.04/audio hour; free tier rate-limited |
| AI replies | Groq | $0.15/$0.60 per 1M tokens (gpt-oss-120b) |
| Telephone numbers, inbound/outbound minutes | Twilio | Number rental + per-minute termination; **Zambia ≈ $0.73–$1.08/min** |
| Live call audio transport | Twilio Media Streams ($0.0044/min) or ConversationRelay ($0.07/min) | Only needed once real calls are enabled |
| PSTN-quality speech synthesis | ElevenLabs / Groq Orpheus / Twilio voices | Browser speech synthesis cannot be sent down a phone line |
| Card payments & subscriptions | Stripe/Paddle/etc. | Not integrated; nothing is charged |

## 6. Features not yet operational

- **Real telephone calls** (inbound and outbound) — adapter, webhook validation and call records exist, but no provider
  is configured, no number is assigned and the calling flag is off. TwiML honestly states that live voice is unavailable.
- **Real-time media gateway** — no websocket service, so no audio streaming, VAD-based barge-in on calls, µ-law
  transcoding, or per-call conversation state. Only the browser pipeline runs.
- **Human transfers / live escalation** — instructions are stored and used in prompts; no dial path is implemented.
- **Call transcripts and AI summaries** — schema and UI exist, but nothing writes them until the gateway exists.
  Nothing is fabricated; the UI says "no transcript stored".
- **Billing/subscription purchase** — plan assignment is administrative only; no payment provider, no invoices.
- **Automatic retention purging** — a preference is stored, but no scheduled job deletes old records.
- **Distributed rate limiting** — in-process only; replace with Redis before multi-region scale.
- **App Check enforcement** — implemented but disabled until the site key is configured.
- **Cloud Functions / background jobs / transactional email beyond Firebase Auth** — not required for the current scope.
- **Automated Firestore rules tests** — no Java/emulator in this environment; rules were reviewed, not executed.

## 7. Estimated operating costs (verified pricing, 2026-10-24)

### Groq — AI and speech-to-text

| Model | Price |
| --- | --- |
| `whisper-large-v3-turbo` | $0.04 / audio hour (10-second minimum per request) |
| `whisper-large-v3` | $0.111 / audio hour |
| `openai/gpt-oss-120b` | $0.15 input / $0.60 output per 1M tokens |
| `openai/gpt-oss-20b` | $0.075 input / $0.30 output per 1M tokens |

Full-allowance monthly estimate:

| Plan | STT | Test turns | Groq cost |
| --- | --- | --- | --- |
| Starter (30 min, 100 turns) | $0.02 | $0.02 | **≈ $0.05** |
| Business (5 h, 1,500 turns) | $0.20 | $0.36 | **≈ $0.56** |
| Professional (20 h, 10,000 turns) | $0.80 | $2.44 | **≈ $3.24** |

### Twilio — telephony

| Route | Price |
| --- | --- |
| US/Canada outbound | $0.0140 / min |
| US local inbound | $0.0085 / min |
| US local number | $1.15 / month |
| Media Streams | $0.0044 / min |
| ConversationRelay | $0.07 / min |
| **Zambia local** | **$0.7274 / min** |
| **Zambia mobile** | **$1.0758 / min** |

A 1,000-minute US inbound agent month costs roughly **$15** (Twilio + Streams + Whisper + tokens, excluding TTS).
The same 1,000 minutes to Zambian mobiles would cost **≈ $1,076** — far above the proposed $19/$79 plans. Included
minutes must therefore be priced per destination, or sold as credit; this is flagged in `docs/PRICING.md` and in the
plan copy.

### Firebase

Auth and App Check are effectively free at this scale. Firestore costs depend on reads/writes: typically a few cents
per customer per month (roughly 3–5 writes per conversation turn plus dashboard reads). Hosting is separate.

### Bottom line

At the proposed prices, the platform is comfortably viable for AI usage and US/Canada telephony, but **not** for
high-cost destinations such as Zambian mobile termination. Do not enable calling or publish included-minute promises
until destination-specific rates and number availability are confirmed with the provider.

---

## Recommended next steps

1. Configure Firebase, deploy rules/indexes, add `GROQ_API_KEY`, and run the manual plan in `docs/TESTING.md`.
2. Move rate limiting to Redis if deploying to a serverless, multi-region host.
3. Build the websocket media gateway + a TTS provider before marketing live calling.
4. Re-price minute allowances per destination using verified provider rates.
5. Integrate a payment provider (checkout + webhooks + idempotent subscription state) before charging anyone.
