# Setup and configuration

This guide lists every manual step required to run VOICEPILOT AI on the existing Firebase project `xacheus-ai`.
The app runs in a degraded but honest mode until these steps are done: provider panels show "not activated" rather than
fake results.

---

## 1. Firebase (project `xacheus-ai`)

### 1.1 Enable Authentication

1. Firebase Console → **Authentication** → *Get started*.
2. **Sign-in method** → enable **Email/Password**.
3. Optional: enable **Google** (the login page offers it; without it, the popup returns an explanatory error).
4. **Settings → Authorized domains**: add every hostname you serve from:
   - `localhost` (local development)
   - your preview host (e.g. `3000-<sandbox>.e2b.app`)
   - your production domain
5. **Templates**: customise the verification and password-reset emails so they carry the VOICEPILOT AI name.

Without step 4, sign-in fails with `auth/unauthorized-domain`; the UI surfaces that message verbatim.

### 1.2 Create Firestore

1. **Firestore Database** → *Create database* → **Production mode** → choose a region close to your users.
2. Deploy rules and indexes from this repository:

```bash
npm i -g firebase-tools        # once
firebase login                 # interactive, uses your Google account
firebase use xacheus-ai
firebase deploy --only firestore:rules,firestore:indexes
```

`firestore.rules` makes the database **read-only for clients** (owner-scoped reads, admin claim for cross-tenant reads).
All writes happen through the server with the Admin SDK. `firestore.indexes.json` adds the composite indexes the app
queries (`calls` by owner + createdAt, usage by month, errors by createdAt).

### 1.3 Service account (server only)

1. **Project settings → Service accounts → Generate new private key**.
2. Put the JSON on one line in your server environment:

```bash
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"xacheus-ai",...}'
```

Alternatively set `FIREBASE_SERVICE_ACCOUNT_FILE=/absolute/path/service-account.json` on a VM.
On Vercel/other hosts use the environment variable; do **not** commit the file (it is git-ignored).

This credential powers: agent creation, workspace writes, usage counters, call records, admin APIs, error logging.

### 1.4 App Check (recommended, optional)

1. **App Check** → register the web app with **reCAPTCHA v3**; copy the site key.
2. Set `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` and redeploy. The client initialises App Check automatically.
3. After traffic looks healthy, set `APP_CHECK_ENFORCE=true` on the server — API routes then require a valid
   `X-Firebase-AppCheck` token and Firebase can enforce App Check for Firestore.
4. Only then enable enforcement in the Firebase console.

### 1.5 Storage

Not required. The platform never stores audio or customer files. `storage.rules` therefore denies all access. If you
later add recording storage, write explicit owner-scoped rules first.

### 1.6 First administrator

Administrator access is a **custom claim**, never a profile field:

```bash
# after FIREBASE_SERVICE_ACCOUNT_KEY is available in the shell environment
node scripts/set-admin.mjs owner@example.com
# revoke with: node scripts/set-admin.mjs owner@example.com --revoke
```

The user must sign out and back in. Every admin API call re-verifies the claim server-side.

---

## 2. Groq (AI + speech-to-text)

1. Create a key at <https://console.groq.com/keys>.
2. Set `GROQ_API_KEY` in the **server** environment (never `NEXT_PUBLIC_*`).
3. Defaults, verified against Groq's model catalogue on **2026-10-24**:
   - Chat: `openai/gpt-oss-120b` — production, $0.15 in / $0.60 out per 1M tokens, 131k context.
   - Speech-to-text: `whisper-large-v3-turbo` — $0.04 per audio hour, max file 100 MB (this app caps uploads at 4 MB).
   - **Do not use `llama-3.3-70b-versatile`**: Groq retired Llama 3.1 8B and 3.3 70B for free/developer tiers on
     2026-08-16; those IDs are enterprise-only now.
4. Verify with `node scripts/doctor.mjs --live`, which queries `/openai/v1/models` and checks that both configured
   model IDs exist on your account.

Notes
- Whisper is speech **recognition** only. It does not produce spoken audio or conversational answers; replies come from
  the chat model and, in the browser, from the Web Speech synthesiser.
- Groq bills a minimum of 10 seconds per transcription request. The cost estimator applies that minimum.
- Free-tier limits (2026): Whisper ~20 requests/min, 2,000/day, 7,200 audio seconds/hour, 28,800/day.
- If a model is unavailable, `/api/transcribe` and `/api/chat` return a 502 explaining that an administrator must update
  the model setting — they never fabricate a response.

---

## 3. Telephony (optional, disabled by default)

Calling remains disabled until **all** of the following are true:

| Requirement | Detail |
| --- | --- |
| Twilio account verified | Business verification may be needed before some destinations/numbers |
| Number capable of your destinations | Check country coverage and per-minute rates in Twilio's pricing pages |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Server-only credentials |
| `TWILIO_WEBHOOK_BASE_URL` | Public HTTPS origin Twilio can reach (no localhost) |
| Real-time voice gateway | A websocket service that bridges call audio ↔ STT ↔ LLM ↔ TTS, exposed as `VOICE_STREAM_URL` (wss://) |
| `TELEPHONY_CALLING_ENABLED=true` | Set only after an end-to-end test with a verified number |

Points to note before you buy numbers:

- **Zambia is expensive** from international Twilio origination: published pay-as-you-go rates are **$0.7274/min** to
  Zambian local numbers and **$1.0758/min** to Zambian mobiles (checked 2026-10-24). At $19/month for 60 minutes, a
  Zambian mobile campaign would cost roughly $64 per hour of talk time. Plan accordingly, or use a local carrier/SIP
  interconnect. See `docs/PRICING.md`.
- Twilio number availability in Zambia must be confirmed in the console; do not assume a local number exists.
- The current webhook returns TwiML that says live voice is unavailable unless `VOICE_STREAM_URL` is set. It never
  pretends a conversation happened.
- Consent, opt-out and recording laws vary by country. The outbound endpoint requires a verified email, an explicit
  consent checkbox and enforces a 5-calls/hour limit, but legal compliance remains an operator responsibility.

---

## 4. Environment reference

```bash
# Public (safe in the browser)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=xacheus-ai.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=xacheus-ai
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=xacheus-ai.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY=      # optional

# Server only
GROQ_API_KEY=                                # required for AI
GROQ_TEXT_MODEL=openai/gpt-oss-120b
GROQ_WHISPER_MODEL=whisper-large-v3-turbo
FIREBASE_PROJECT_ID=xacheus-ai
FIREBASE_SERVICE_ACCOUNT_KEY=                # required for writes/metering
# FIREBASE_SERVICE_ACCOUNT_FILE=./secrets/service-account.json
APP_CHECK_ENFORCE=false
RATE_LIMIT_TRANSCRIBE_PER_HOUR=30
RATE_LIMIT_CHAT_PER_HOUR=120

# Optional telephony
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
TWILIO_WEBHOOK_BASE_URL=
VOICE_STREAM_URL=
TELEPHONY_CALLING_ENABLED=false

# Plan catalogue overrides (optional)
STARTER_AGENTS=1
STARTER_TRANSCRIPTION_SECONDS=1800
STARTER_CHAT_REQUESTS=100
# PLAN_CONFIG_JSON=[{"id":"business","priceMonthlyUsd":24}]
```

---

## 5. Deployment notes

For Vercel, follow [docs/VERCEL.md](./VERCEL.md): use the Next.js preset, Node.js 24.x, and configure
keys in Project Settings → Environment Variables before deploying.

- **Node runtime required** for API routes (Admin SDK, crypto, fetch streaming). The routes declare
  `runtime = 'nodejs'`.
- `maxDuration` is set to 120 s on `/api/transcribe` and 60 s on `/api/chat`. Keep provider timeouts inside those
  budgets (currently 90 s and 30 s).
- Rate limiting is **in-process**. On serverless/multi-region deployments, swap
  `src/lib/api/rate-limit.ts` for Redis (Upstash) or a Firestore-backed counter; the interface is a single function.
- Set all server variables in the hosting provider, not in a committed file. Rotate the Groq key and Twilio token if
  they are ever exposed.
- After deploying rules and indexes, run the manual test plan in `docs/TESTING.md`.
- Microphone recording works best over HTTPS. Inside embedded preview frames the browser may block microphone access
  due to the parent frame's permissions policy; file upload remains available.
