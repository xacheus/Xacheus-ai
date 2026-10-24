# Provider pricing and cost model

All figures below were checked on **2026-10-24** against the providers' own documentation. They are estimates for
planning, not invoices. Re-verify before committing to customer pricing.

## Groq (AI and speech-to-text)

| Item | Price | Source |
| --- | --- | --- |
| `whisper-large-v3-turbo` | **$0.04 per audio hour** (10-second minimum per request) | console.groq.com/docs/models |
| `whisper-large-v3` | $0.111 per audio hour | console.groq.com/docs/models |
| `openai/gpt-oss-120b` | $0.15 input / $0.60 output per 1M tokens | console.groq.com/docs/models |
| `openai/gpt-oss-20b` | $0.075 input / $0.30 output per 1M tokens | console.groq.com/docs/models |
| `llama-3.3-70b-versatile` | Enterprise "Contact Sales" — **retired for free/developer tiers 2026-08-16** | console.groq.com/docs/deprecations |
| Prompt caching discount | 50% off input tokens on cache hits | Groq pricing docs |

Whisper maximum upload: 100 MB on developer plans; this app enforces 25 MB for safety and predictable latency.

### Estimated monthly Groq cost per plan (if a customer used the full allowance)

Assumes ~1,200 input tokens + ~100 output tokens per test turn, and the 10-second minimum for short clips.

| Plan | Speech-to-text | Test turns | Estimated Groq cost |
| --- | --- | --- | --- |
| Starter (30 min, 100 turns) | 0.5 h × $0.04 = **$0.02** | 100 × ~$0.00024 = **$0.02** | **≈ $0.05** |
| Business (5 h, 1,500 turns) | 5 h × $0.04 = **$0.20** | 1,500 × ~$0.00024 = **$0.36** | **≈ $0.56** |
| Professional (20 h, 10,000 turns) | 20 h × $0.04 = **$0.80** | 10,000 × ~$0.00024 = **$2.44** | **≈ $3.24** |

A typical small customer will use a fraction of this, so Groq costs are negligible relative to the proposed $19/$79
prices. Telephony, not AI, is the cost driver.

## Twilio (telephony — not yet activated)

### United States / Canada (published pay-as-you-go)

| Item | Price |
| --- | --- |
| Outbound call to US/Canada | $0.0140 / min |
| Inbound call on a US local number | $0.0085 / min |
| US local number rental | $1.15 / month |
| Media Streams (bidirectional audio to your gateway) | $0.0044 / min |
| ConversationRelay (managed voice AI, if used instead of a custom gateway) | $0.07 / min |
| Call recording (optional) | $0.0025 / min |
| Answering machine detection | $0.0075 / call |

### Zambia (published pay-as-you-go, 2026-10-24)

| Route | Price |
| --- | --- |
| Call to Zambian local number | **$0.7274 / min** |
| Call to Zambian mobile | **$1.0758 / min** |
| SIP trunking to Zambia | $0.7234 / min (local), $1.0718 / min (mobile) |

**This changes the plan economics.** A 60-minute Business allowance consumed entirely on Zambian mobiles costs
≈ **$64.55** in termination fees — more than three times the $19 subscription. For South Africa, the published rates
are cheaper when originating from a Twilio-ZA number ($0.0362/min local, $0.0499/min mobile) than from international
origination ($0.4725/$0.3749 per min), which is why local-origin numbers matter.

Implications:

1. Do not market "60 included minutes" without specifying the destination. Minutes must be priced per destination or
   sold as credit.
2. Confirm number availability and identity-verification requirements in the Twilio console before promising service in
   a country.
3. Consider a local carrier or SIP interconnect for African destinations, or a voice-AI platform (Vapi/Retell) if it
   offers better local termination pricing.

### Example: 1,000 inbound US minutes on an AI agent

| Component | Cost |
| --- | --- |
| Twilio inbound minutes (1,000 × $0.0085) | $8.50 |
| Twilio number | $1.15 |
| Media Streams (1,000 × $0.0044) | $4.40 |
| Whisper transcription (16.7 h × $0.04) | $0.67 |
| Chat model (~1.5M input + 0.15M output tokens) | ≈ $0.32 |
| TTS provider (varies; browser synthesis is free but not usable on PSTN) | $0–$10 |
| **Total (excluding TTS)** | **≈ $15.04** |

That is roughly $0.015 per minute before TTS — comfortable at $19+ plans for US traffic, impossible at those prices for
Zambian mobile termination.

## Firebase

| Item | Free (Spark) | Blaze (pay as you go) |
| --- | --- | --- |
| Firestore reads | 50k/day | $0.03 / 100k (varies by region) |
| Firestore writes | 20k/day | $0.09 / 100k |
| Auth (email/password) | Free for most usage | Free for most usage |
| App Check | Free | Free |

Each conversation turn produces roughly 3–5 writes (usage counters) and each dashboard load a few dozen reads, so
Firestore cost is typically cents per customer per month. Firestore requires the Blaze plan for outbound network calls
only if you use Cloud Functions; this app calls Groq from its own server.

## Hidden costs to budget

- Hosting (Vercel/Cloud Run) for the Next.js app.
- A websocket media gateway host (only if you enable real PSTN conversations).
- A TTS provider for PSTN audio (browser voices cannot be played down a phone line).
- Twilio number rental per country and possible regulatory bundles.
- Taxes/VAT on telephony and on your subscriptions.
