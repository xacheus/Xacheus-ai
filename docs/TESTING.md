# Testing

## Environment limits for this build

The build was created in a sandbox with **no** Firebase service-account credentials, **no** `GROQ_API_KEY`, **no**
Twilio account, no Java (so no Firestore emulator) and no outbound access to `api.groq.com` or Firebase backends.
Anything that requires those services is listed as **blocked → manual** below. Nothing was faked to work around that.

## 1. Automated tests — 55 passing

Run with `npm test` (node:test via tsx, with the React server condition for server-only modules). Latest run: **55 passed, 0 failed**.

| File | Tests | Covers |
| --- | --- | --- |
| `tests/prompt.test.ts` | 6 | Business facts injected; guardrails present; hours precedence; 20-turn history cap; markdown/emoji stripping |
| `tests/voice-state.test.ts` | 7 | Full turn transitions; barge-in only while speaking; ignored events; stage timeouts; termination/reset; 40-turn cap |
| `tests/twilio.test.ts` | 8 | Published Twilio signature vector; tamper/wrong-token rejection; status mapping; TwiML with/without gateway; HTML escaping; webhook URL resolution (configured base + forwarded headers); disabled-by-default |
| `tests/validation.test.ts` | 10 | Agent defaults/limits; partial patches; workspace email rules; chat history cap; E.164 + consent enforcement; retention bounds; rate limiter window/key isolation; audio upload validation (empty, tiny, >4 MB, wrong type, extension fallback) |
| `tests/plans-pricing.test.ts` | 8 | Plan catalogue/limits/formatting; Whisper per-hour maths; 10-second billing minimum; gpt-oss token pricing; USD formatting |
| `tests/groq-client.test.ts` | 8 | Multipart shape, model, auth header and `verbose_json`; 401 → configuration error with no key leak; 429 → rate-limit error with retry; empty completion handling; usage parsing; timeout mapping; model-list failure tolerance |
| `tests/environment.test.ts` | 8 | Missing-key behavior; environment overrides; public endpoints exclude secrets; server-only boundary; doctor redaction (Groq and invalid service accounts); Vercel build settings; ignored secret files |

The Groq tests inject a stubbed `fetch`; they validate the real request/response handling without network access.

## 2. Static checks

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Pass (strict mode, no errors) |
| `npm run build` | Pass — 33 routes compiled (13 app pages + 17 API handlers) |
| Client-bundle secret scan | `grep -r "gsk_\|BEGIN PRIVATE KEY\|private_key" .next/static` → **0 matches** |
| Server-only variables in client code | Only **names** appear in UI copy (`GROQ_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_KEY`); no values |
| Security headers | CSP, `nosniff`, `Referrer-Policy`, `Permissions-Policy` present on HTML; `Cache-Control: no-store` on `/api/*` |

## 3. API contract checks (executed against the production build)

| Request | Expected | Observed |
| --- | --- | --- |
| `GET /`, `/login`, `/signup`, `/forgot-password` | 200 | 200 |
| `GET /app/*` (dashboard, agents, voice-lab, calls, workspace, usage, settings, admin) | 200 (client guard redirects when signed out) | 200 |
| `GET /api/status` | 200, no secrets | 200, booleans + public plan data only |
| `GET /api/health` | 200 `degraded` without credentials | `degraded`: `firebaseAdmin: credentials-missing`, `groq: missing-key` |
| `GET /api/me` without token | 401 | 401 `unauthorized` |
| `GET /api/workspace` without token | 401 | 401 |
| `GET /api/admin/{overview,providers,users,agents,errors}` without token | 401 | 401 |
| `POST /api/agents`, `/api/chat`, `/api/transcribe`, `/api/calls/outbound` without token | 401 | 401 |
| `POST /api/transcribe` with a forged bearer token | 401 (never reaches provider) | 401 `Invalid session token` |
| `POST /api/workspace` | 405 (only GET/PUT) | 405 |
| `POST /api/telephony/twilio/voice` with no configuration | 503, no TwiML claim | 503 `Telephony is not configured.` |
| `GET /nonexistent` | 404 | 404 |

## 4. What could not be tested here (blocked, manual)

| Item | Why blocked | How to verify |
| --- | --- | --- |
| Registration / login / password reset | Needs a live Firebase Auth project | Run the app, create an account, confirm the verification email, reset the password |
| Firestore reads (agents, calls, workspace) | Needs rules deployed + signed-in user | Deploy rules, create an agent, sign in as a second user and confirm no data leaks |
| Agent create/edit/delete + plan limit | Needs `FIREBASE_SERVICE_ACCOUNT_KEY` | Create an agent with a 1-agent Starter plan; the second attempt must return 402 `quota_exceeded` |
| Live Groq transcription | Needs `GROQ_API_KEY` + network | Upload 5–10 s of speech; expect text, duration, model, charged seconds |
| Live AI chat reply | Needs `GROQ_API_KEY` | Open the Voice lab, ask an answered FAQ; expect a grounded reply |
| Provider error surfaces | Needs a key | Use a revoked key → expect 503 configuration message, not a stack trace |
| Outbound call | Needs verified Twilio account + gateway | Do not enable until a test number passes end-to-end |
| Twilio webhooks | Need a public HTTPS URL | Point a number at `/api/telephony/twilio/voice`, confirm signature validation accepts real requests |
| Visual responsiveness | No browser binary available in the sandbox | Check 390 px, 768 px, 1280 px widths manually |

## 5. Manual test plan (run after configuration)

**Authentication**
1. `/signup` → create an account → land on `/app`; an unverified banner appears with a resend button.
2. Sign out; `/login` → sign in; `/forgot-password` → receive a reset email.
3. Try a wrong password → expect "Email or password is incorrect".

**Workspace and agents**
4. `/app/workspace` → save business name, hours, services, one FAQ → success alert; refresh persists.
5. `/app/agents/new` → create an agent with the workspace defaults; it appears on `/app/agents`.
6. Edit the agent, deactivate it, confirm the Voice lab refuses conversations for inactive agents.
7. On the Starter plan, create a second agent → expect a plan-limit error (402), not a silent failure.
8. Delete the agent → confirm removal; associated usage remains.

**Transcription**
9. Record 5 seconds of speech, press Transcribe → transcript with duration/model metadata.
10. Copy, Clear, then Retry with the same file → works.
11. Upload a `.txt` file renamed to `.mp3` → provider error or unsupported-format message, never a crash.
12. Upload a >4 MB file → client-side and server-side rejection with a clear message.
13. Deny microphone permission → actionable permission message; upload path still works.

**Conversation**
14. Send a typed question covered by the workspace → grounded answer.
15. Ask about something not stored → the agent says it does not know and offers a human handoff; it must not invent a price.
16. Enable spoken replies → hear the answer; press Barge-in → playback stops and state returns to listening.
17. Send 41 turns → the session cap stops further sends.

**Security**
18. Sign in as user B; open `/app/calls` and `/app/agents` → no data from user A.
19. Attempt `GET /api/calls/{userA-call-id}` as user B with a valid token → 404.
20. Set `role`/`planId` on your profile in the browser console → Firestore rules reject the write; plan stays unchanged.
21. Grant yourself `admin` from the client → impossible; only `scripts/set-admin.mjs` with a service account works.
22. Remove the `admin` claim → `/app/admin` shows "Administrator access required" and the API returns 403.

**Mobile**
23. At 390 px: sidebar becomes a drawer, tables become cards, forms stack, dialogs fit, no horizontal scroll.
24. Voice lab: recording controls remain reachable and the transcript area is scrollable.

## 6. Security verification notes

- All API routes authenticate before doing work; `/api/transcribe` and `/api/chat` no longer reveal provider
  configuration to anonymous callers.
- Ownership checks return 404 for foreign resources to avoid existence probing.
- Provider errors are normalised; status codes are logged, bodies are not.
- Rate limits are enforced per user before provider calls; the limiter is in-process (see SETUP for serverless).
- Audio is never written to disk or object storage; Storage rules deny everything.
