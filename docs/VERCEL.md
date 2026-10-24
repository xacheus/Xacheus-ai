# Deploy VOICEPILOT AI on Vercel

## 1. Project settings

Use the existing **xacheus-ai** project for this repository, or import `xacheus/Xacheus-ai` if setting up a new account.
Do not deploy this repository over an unrelated project.

| Setting | Value |
| --- | --- |
| Framework preset | **Next.js** |
| Root directory | Repository root (`./`) |
| Node.js | **24.x**, at least 24.12 (required by the locked Firebase dependencies) |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | Next.js default; **do not** use `out` or a static-export preset |

`vercel.json` records the framework and commands. `package.json` pins the Node major, and `.nvmrc` matches it for
local development. API routes need Node.js serverless functions, not Edge runtime or Firebase Hosting static output.

To enable automatic deployments, connect the Git repository under **Settings → Git**. Leave the production branch as
`main`; other branches get Preview deployments. A branch can also be deployed explicitly to Production without
changing that setting. This Arena session works only on `arena/8c0a2740-xacheus-ai`.

## 2. Add environment variables securely

Open **Project Settings → Environment Variables**. For the current project:

<https://vercel.com/zacheussimbaya-9420s-projects/xacheus-ai/settings/environment-variables>

Add the following to **Production** and **Preview**. Keep Development credentials local in the git-ignored `.env.local`;
use a separate development key where possible. Do not paste secrets into chat or commit them to Git.

| Variable | Value | Visibility |
| --- | --- | --- |
| `GROQ_API_KEY` | Your real key from the Groq console | **Sensitive**, server only |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Full service-account JSON for `xacheus-ai` (one line, or base64-encoded JSON) | **Sensitive**, server only |
| `FIREBASE_PROJECT_ID` | `xacheus-ai` | Plain, server only |
| `GROQ_TEXT_MODEL` | `openai/gpt-oss-120b` | Plain, server only |
| `GROQ_WHISPER_MODEL` | `whisper-large-v3-turbo` | Plain, server only |
| `TELEPHONY_CALLING_ENABLED` | `false` | Plain, server only |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase **web** API key from `.env.example` / Firebase Console | Plain, public |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `xacheus-ai.firebaseapp.com` | Plain, public |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `xacheus-ai` | Plain, public |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `xacheus-ai.firebasestorage.app` | Plain, public |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase web configuration value | Plain, public |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase web configuration value | Plain, public |

Important:

- **Never** name a provider secret `NEXT_PUBLIC_GROQ_API_KEY` or `NEXT_PUBLIC_FIREBASE_SERVICE_ACCOUNT_KEY`.
  Next.js embeds `NEXT_PUBLIC_*` values into browser JavaScript. The Firebase **web** API key is intentionally public;
  the Groq key and Firebase **Admin** private key are not.
- Paste the service-account JSON into the Vercel value field **without surrounding shell quotes**. Preserve `\n` in
  `private_key`; the server normalizes escaped newlines. Do not deploy a service-account JSON file or use a path to
  your laptop's filesystem.
- Secrets are read by the server-only `src/lib/env.ts` module. Importing that module into a client component fails
  the Next.js build. Browser requests call relative `/api/*` endpoints; the browser never sends a Groq API key.
- Do not put secrets under `env` in `next.config.mjs`: that option can inline values into browser bundles. Do not
  put secret values in `vercel.json`. `.env*` files (except the template) and `secrets/` are git-ignored and excluded
  from CLI uploads.
- Missing credentials do **not** block building the website. AI and privileged database operations stay unavailable
  until real credentials are supplied. An empty or dummy environment variable does not activate a provider.
- Changes apply to **new deployments only**. After adding or rotating variables, redeploy the intended branch using
  the correct environment. Public Firebase variables must also be available at build time.

Optional App Check / Twilio variables are described in [SETUP.md](./SETUP.md). Keep telephone calling disabled until
there is a real, tested external voice gateway.

## 3. Deploy and allow the domain in Firebase

1. Deploy the desired Git revision using Vercel's dashboard or the connected deployment integration.
2. Under **Firebase Console → Authentication → Settings → Authorized domains**, add the hostname Vercel actually
   assigns (for example, the project's production `*.vercel.app` hostname). Add each Preview hostname you use for
   Google sign-in as well; Firebase does not accept wildcard authorized domains.
3. Enable Email/Password and Google sign-in in Firebase, if not already enabled.
4. Deploy the repository's Firestore rules and indexes following [SETUP.md](./SETUP.md).
5. Check **Vercel → Settings → Deployment Protection**. If Vercel Authentication protects the production URL,
   visitors will be asked to sign in to Vercel before reaching the app. Adjust production protection in the dashboard
   if the website should be public; keep sensitive Preview deployments protected as appropriate.

No custom domain or DNS change is required to use Vercel's assigned hostname. The sandbox cannot edit Firebase
Console settings for you.

## 4. Verify the deployment

```bash
# Replace <deployment-hostname> with the actual hostname returned by Vercel.
curl -fsS https://<deployment-hostname>/api/health
curl -fsS https://<deployment-hostname>/api/status
```

- `/api/health` should return `status: "ok"`, `groq: "configured"`, and `firebaseAdmin: "ready"` after both secrets
  are present. `status: "degraded"` means the web server runs but a required credential is missing. This endpoint
  returns HTTP 200 for liveness and does not print credentials.
- `/api/status` reports only non-secret capability flags/model names. These checks confirm **presence**, not that
  credentials are valid or that Firestore rules/indexes have been deployed.
- Sign in, create a workspace and agent, then send a chat message and transcribe a small audio file to validate the
  credentials end-to-end. Follow [TESTING.md](./TESTING.md) for the full plan.
- For a local check with your own credentials: `npm run doctor` or `npm run doctor -- --live`. The live check queries
  Groq's model list without printing the key. Do not copy a production secret into command arguments or logs.

## 5. Serverless constraints

- **Audio files are capped at 4 MB** on both the client and server, leaving space under Vercel's **4.5 MB** request
  limit for multipart overhead. Next.js's Server Actions body-size setting cannot raise Vercel's function limit.
  Supporting larger uploads requires a secure direct-to-storage flow; this app does not store audio.
- `/api/transcribe` has a 120-second function budget and a 90-second provider timeout. `/api/chat` has a 60-second
  function budget and a 30-second provider timeout. Both use the Node runtime.
- Existing rate limiting is **in-memory per instance**; quotas are metered in Firestore. Before a public paid launch,
  replace the rate limiter with a distributed store (for example Redis/Upstash). Do not assume an in-memory limiter
  is shared across Vercel instances.
- Live phone audio needs a separate persistent WebSocket gateway. Vercel request/response functions do not supply
  that service. Billing and live telephone conversations are not operational in this build.
