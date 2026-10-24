# VOICEPILOT AI

AI voice-agent platform for businesses: design agents, ground them in your own business facts, transcribe audio with
Groq Whisper, test text conversations, and meter usage against server-enforced plan limits.

> **Status: development build.** Speech-to-text and text conversations work as soon as a Groq key is configured. Real
> telephone calling, live audio streaming and billing are **not operational** on this deployment — nothing simulates a
> call, fabricates a call record or charges a customer.

---

## What is implemented

| Area | State | Notes |
| --- | --- | --- |
| Firebase Auth (email/password, Google) | Implemented | Client SDK + Admin SDK token verification |
| Firestore data model + security rules | Implemented | Rules are read-only for clients; all writes go through the server |
| Business workspace | Implemented | Facts, FAQs, products, hours, escalation |
| AI agent builder (CRUD, activate/deactivate) | Implemented | Plan agent limits enforced server-side |
| Groq Whisper speech-to-text | Implemented | `POST /api/transcribe`, server-only key, 4 MB cap |
| Groq chat conversations | Implemented | `POST /api/chat`, guarded system prompt, gpt-oss-120b default |
| Voice lab (record/upload, transcript, copy/clear/retry, TTS demo) | Implemented | Browser only — clearly labelled as not a phone call |
| Usage metering + plan limits | Implemented | Monthly counters, atomic increments, server-enforced |
| Dashboard, call history, admin dashboard | Implemented | Empty states only; no fabricated statistics |
| Twilio telephony adapter + webhooks | Implemented but **disabled** | Requires credentials, public webhook, gateway, explicit flag |
| Real-time media gateway (streaming STT/LLM/TTS on calls) | **Not implemented** | Requires a separate websocket service |
| Payment/subscriptions billing | **Not implemented** | Plan assignments are recorded server-side; no money moves |

## Stack

Next.js 15 (App Router, TypeScript, Node runtime) · Tailwind CSS 3 · Firebase 11 (Auth, Firestore, App Check) ·
Firebase Admin 13 · Groq OpenAI-compatible API (Whisper + chat) · Twilio REST (implemented, disabled).

## Quick start

```bash
# Node.js 24.12+ (24.x LTS)
npm ci
cp .env.example .env.local     # add GROQ_API_KEY + FIREBASE_SERVICE_ACCOUNT_KEY
node scripts/doctor.mjs        # verifies configuration without printing secrets
npm run dev                    # http://localhost:3000
```

Minimum to sign in and use the UI: the public Firebase config (already defaulted to `xacheus-ai`).
Minimum to create agents and transcribe: a server service account and a Groq API key.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server on `0.0.0.0:3000` |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Automated tests (prompt, state machine, Twilio signing, validation, rate limits, Groq client, environment/deployment) |
| `npm run doctor` | Environment check (`--live` also verifies Groq models) |
| `npm run set-admin -- <email>` | Grant the `admin` custom claim (server-side only) |

## Deploy on Vercel

Import `xacheus/Xacheus-ai` with the **Next.js** preset. The repository pins Node.js 24.x and supplies
`vercel.json` for reproducible installs and builds. Add `GROQ_API_KEY` and `FIREBASE_SERVICE_ACCOUNT_KEY` as
**Sensitive** environment variables for **Production** and **Preview**, then deploy. Do not put their values in
source code, `vercel.json`, `NEXT_PUBLIC_*` variables, or chat.

See [the Vercel deployment checklist](./docs/VERCEL.md) for the exact settings, Firebase authorized domains,
health checks and serverless limits. Changing an environment variable requires a **new deployment**.

## Environment

Server-only values must never use the `NEXT_PUBLIC_` prefix. See [`.env.example`](./.env.example) and
[`docs/SETUP.md`](./docs/SETUP.md).

| Variable | Required | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | Yes (for AI) | Whisper + chat, read server-side only |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Yes (for writes) | Admin SDK: agents, usage, calls, admin APIs |
| `GROQ_TEXT_MODEL` | No | Default `openai/gpt-oss-120b` (Llama 3.3 70B was retired 2026-08-16) |
| `GROQ_WHISPER_MODEL` | No | Default `whisper-large-v3-turbo` |
| `TWILIO_*`, `TELEPHONY_CALLING_ENABLED` | No | Calling stays disabled unless all are set and tested |
| `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` | No | App Check (reCAPTCHA v3) |

## Documentation

- [docs/VERCEL.md](./docs/VERCEL.md) — Vercel deployment and secure environment variables
- [docs/SETUP.md](./docs/SETUP.md) — Firebase, Groq, Twilio and deployment steps
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — data model, security model, voice pipeline, what is missing
- [docs/TESTING.md](./docs/TESTING.md) — automated tests, API smoke checks, manual test plan
- [docs/PRICING.md](./docs/PRICING.md) — verified provider prices and cost model (incl. Zambia rates)
- [docs/FINAL-REPORT.md](./docs/FINAL-REPORT.md) — implementation report and remaining work

## Security model in one paragraph

Browsers authenticate with Firebase Auth. API routes verify the ID token with the Admin SDK, then check ownership
against Firestore documents server-side. Firestore rules deny all client writes and allow reads only for the owner (or an
`admin` custom claim). The `admin` claim can only be set with a service account. Provider keys are read from the server
environment and never returned by any endpoint. Plan limits, rate limits and usage counters are enforced before any
paid provider call.

## Licence

Proprietary. All rights reserved.
