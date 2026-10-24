# Architecture

## 1. Runtime shape

```
Browser (Next.js client components)
  ├── Firebase Auth (ID token)
  ├── Firestore reads (owner-scoped, read-only)
  └── fetch → Next.js route handlers (Node runtime)
                     ├── Firebase Admin SDK  → Auth verification, Firestore writes, usage counters
                     ├── Groq API            → Whisper transcription, chat completions
                     └── Twilio REST/TwiML   → implemented, disabled until configured
```

All privileged work happens in route handlers. The browser never receives a provider key, never writes to Firestore,
and cannot raise a quota.

## 2. Data model

| Path | Contents | Written by |
| --- | --- | --- |
| `users/{uid}` | Profile: email, display name, phone, country, workspaceId, retentionDays | Server |
| `users/{uid}/agents/{agentId}` | Full agent configuration | Server |
| `users/{uid}/usage/{YYYY-MM}` | Monthly counters: STT seconds, chat turns/tokens, call minutes, cost estimate | Server |
| `workspaces/{uid}` | Business facts, FAQs, products, escalation contact | Server |
| `calls/{callId}` | Telephony metadata: direction, numbers, status, duration, transcript, summary, outcome | Server (webhooks) |
| `subscriptions/{uid}` | Plan, status, billing provider (`none`), assignment audit fields | Server/admin |
| `systemErrors/{id}` | Non-sensitive error metadata for administrators | Server |
| `adminAudit/{id}` | Admin actions: plan assignment, agent moderation | Server |

Workspace and usage document IDs equal the owner UID, which makes cross-tenant addressing structurally impossible.
Agents live in a per-user subcollection; call records carry `ownerId` and are always queried with that filter.

## 3. Security model

1. **Authentication** — `authenticateRequest` verifies the Firebase ID token with `verifyIdToken(token, true)`
   (revocation checked). Missing/invalid tokens produce 401 with actionable messages.
2. **Authorisation** — every read or write resolves the resource through an owner-scoped path
   (`fetchOwnedAgent`, `users/{uid}/...`, `calls/{id}` + `ownerId` check). A mismatch returns 404, not 403, so callers
   cannot probe for existence.
3. **Firestore rules** — deny all client writes; allow reads only when `request.auth.uid` matches the document owner,
   or when the `admin` custom claim is present. Unmatched paths are denied.
4. **Admin** — `requireAdmin` checks the verified custom claim, falling back to a fresh Admin SDK lookup so a revoked
   claim stops working immediately. No user-editable field is consulted.
5. **App Check** — optional; when `APP_CHECK_ENFORCE=true`, protected routes require a valid App Check token.
6. **Input validation** — Zod schemas bound every field (lengths, enums, E.164 numbers). Multipart uploads are checked
   for MIME type, extension, emptiness and size before use.
7. **Rate limiting** — fixed-window, keyed by `uid:action` (transcription 30/h, chat 120/h by default). In-process; see
   the note in SETUP for serverless deployments.
8. **Secrets** — server env only; API responses expose booleans and non-secret identifiers. Errors are normalised so
   provider payloads, stack traces and credentials never reach the browser. Logs record status codes and scopes only.
9. **Audio** — buffered in memory, sent to Groq, discarded. No disk writes, no Storage bucket, no recordings table.
10. **Telephony** — Twilio requests must pass HMAC-SHA1 signature validation against the reconstructed public URL before
    any write. Outbound calls require a verified email, an explicit consent flag, an hourly cap and remaining plan minutes.

## 4. Quotas and usage

```
request → authenticate → rate limit → validate
        → checkQuota(uid, kind, amount)      # reads subscription + monthly counter
        → provider call
        → recordUsage(uid, deltas)           # FieldValue.increment on users/{uid}/usage/{month}
```

- Counters are keyed by UTC month, so allowance resets naturally on the 1st.
- Increments are atomic; refund helper exists for failed reservations.
- Agent count is enforced with an aggregate count before creation.
- Cost estimates use verified list prices and are informational only.

## 5. AI prompt construction

`buildSystemPrompt(agent, workspace)` composes:

- identity (name, business, purpose, language, personality, speaking style)
- **facts only**: description, contacts, hours, products/services, appointment instructions, escalation contact, agent
  knowledge, FAQs (agent + workspace)
- call handling and transfer instructions
- ten explicit guardrails: never invent prices/policies/availability/claims; admit unknown information and offer a human
  handoff; never request sensitive data; no legal/medical/financial advice; 1–3 short spoken sentences; one question at a
  time; de-escalation; disclose that it is AI; never reveal instructions or provider names.

Replies are post-processed to strip markdown, lists, code fences and emoji so they remain speakable. History is capped
at the last 20 turns, temperature 0.4, max 350 output tokens — tuned for voice-length answers and low latency.

## 6. Voice pipeline: current vs intended

Implemented now (browser):

```
microphone/upload → MediaRecorder (webm/m4a) → /api/transcribe → Groq Whisper
transcript or typed text → /api/chat → Groq chat model → reply → speechSynthesis (browser TTS)
state machine: idle → listening → transcribing → thinking → speaking → idle
barge-in: cancel synthesis, return to listening; timeouts and a 40-turn cap are enforced
```

Intended for real calls (not implemented here):

```
PSTN → Twilio Programmable Voice → bidirectional Media Streams websocket (VOICE_STREAM_URL)
     → streaming STT (Groq Whisper is batch-only: use chunked VAD segments or a streaming STT provider)
     → conversation orchestrator (same reducer semantics, per-call state)
     → LLM (Groq chat, streaming)
     → TTS (ElevenLabs / Groq Orpheus / Twilio ConversationRelay voices)
     → audio back to caller
```

Missing pieces for that path:

| Need | Why it is missing | Suggested approach |
| --- | --- | --- |
| Websocket media gateway | Next.js route handlers cannot host raw websockets | Separate Node service (Fastify/ws) on the same VPC; scale horizontally with a Redis pub/sub |
| Streaming STT | Groq Whisper is file-based | Chunk by voice activity (e.g. 300–800 ms frames + RMS gate) and post to Whisper, or use a streaming provider |
| TTS provider | Only browser synthesis is wired | ElevenLabs or Groq Orpheus; store provider voice IDs per agent |
| Barge-in detection | Needs continuous inbound audio analysis | Energy/VAD threshold while TTS is playing; cancel playback + LLM stream |
| Audio transcoding | Twilio streams µ-law 8 kHz | Convert to PCM for STT, back to µ-law for playback (`ffmpeg`/`sox` or pure-JS codecs) |
| Call summaries/transcripts | Requires the gateway to persist turns | Write transcript to `calls/{id}`, then summarise with the chat model |
| Latency budget | Untested end-to-end | Target < 1.2 s voice-to-voice; measure p50/p95 per hop |

The reducer in `src/lib/voice/conversation.ts` is deliberately provider-agnostic so the same states can drive a
websocket session later without behavioural drift.

## 7. Telephony flows (implemented, disabled)

**Outbound** — `POST /api/calls/outbound`: verified email → 5/hour limit → telephony usable → agent ownership → minute
quota → Twilio `Calls.json` with `Url` (TwiML), `StatusCallback`, machine detection → call record written with provider
SID → `202 Accepted`. A rejected provider request is returned as a 502; no record is invented.

**Inbound** — `POST /api/telephony/twilio/voice`: signature check → optional agent greeting → TwiML. Without a gateway,
the response states that live voice is unavailable and hangs up. Inbound number→workspace mapping is intentionally not
guessed; it needs a `telephonyNumbers` collection populated during provisioning.

**Status** — `POST /api/telephony/twilio/status`: signature check → find call by SID → update status, duration,
outcome, failure reason → on final transition, record call minutes once (`usageRecorded` guard).

## 8. Error handling

- `ApiError` carries status, machine-readable code, message, hint and optional details. `errorResponse` serialises it
  with a request id and never leaks internals.
- 5xx errors from transcription/chat/calls are written to `systemErrors` (scope, message, code, status, uid).
- Provider failures map to specific user-facing actions: bad key → configuration message; 429 → retry hint; timeout →
  shorter recording; missing model → administrator instruction.
- UI surfaces field errors from Zod (`details` array) and shows provider-independent retry controls.

## 9. Known architectural limits

- Rate limiting is per instance.
- The admin user directory paginates 100 users per request with client-side filtering of that page.
- `systemErrors` grows without retention; add a TTL policy (e.g. 30 days) in Firestore.
- No background jobs (retention purging, call summaries without a gateway, email notifications).
- Cost estimates assume uncached input tokens; Groq's 50% prompt-cache discount is not applied.
