# Tenant Advocate

An AI tenant advocate for NYC renters: it reads your lease, checks your building's public HPD record, keeps a dated log of problems, and answers with a source for every claim. Information only, not legal advice.

This repo is the foundation: auth, configuration, tracing, and a client plus smoke test for every external service. Product features (lease extraction, building check, issue log, orchestrator) build on top of it.

## Layout

```
server/   Node + TypeScript + Express API
  src/auth/        Google sign-in, signed session cookie, CSRF origin check
  src/services/    tracing (Arize), llm (Bedrock or Anthropic), daytona, memory (SurrealDB), hpd (NYC Open Data)
  scripts/smoke.ts connectivity checks for each service
web/      React + Vite client
```

## First-time setup

1. **Install:** `npm install` (Node 20.11+).
2. **Env:** `cp .env.example .env`, then fill in the values below.
3. **Google sign-in (required):**
   - Google Cloud Console > APIs & Services > Credentials > Create credentials > OAuth client ID > *Web application*.
   - Authorized JavaScript origins: `http://localhost:5173` (add your production URL later).
   - If prompted, configure the OAuth consent screen first (External, add yourself as a test user).
   - Put the client ID in `GOOGLE_CLIENT_ID`. No client secret is needed for this flow.
   - `SESSION_SECRET`: `openssl rand -base64 48`.
4. **Other services** (each is optional until you use it; `npm run smoke` shows what's missing):
   - Model (default Claude on Amazon Bedrock): `AWS_REGION` plus AWS credentials (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_SESSION_TOKEN`, or `AWS_PROFILE`, or `AWS_BEARER_TOKEN_BEDROCK`), and a `BEDROCK_MODEL_ID` your account can access. To use the first-party API instead, set `MODEL_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`.
   - `ARIZE_SPACE_ID`, `ARIZE_API_KEY`: Arize AX > Space Settings.
   - `DAYTONA_API_KEY`: Daytona dashboard.
   - `AGENT_MEMORY_*`: SurrealDB Studio > Agent Memory > deploy a context, then create an API key (`sp-...`). `AGENT_MEMORY_ENDPOINT` is the context host URL.
5. **Check everything:** `npm run smoke` (or `npm run smoke -- hpd model`).
6. **Run:** `npm run dev`, then open http://localhost:5173.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API on :3001 and Vite on :5173 (Vite proxies `/api` and `/auth`) |
| `npm run smoke [-- names]` | Service checks: `config hpd model arize daytona memory` |
| `npm run typecheck` | Type-check both workspaces |
| `npm run build` | Build web, then server |
| `npm start` | Run the built server; it also serves `web/dist` |

## How auth works

The browser gets a Google ID token, posts it to `POST /auth/google`, and the server verifies signature, expiry and audience, requires a verified email, applies the optional `ALLOWED_EMAILS` / `ALLOWED_EMAIL_DOMAINS` allowlist, then sets an HttpOnly, SameSite=Lax, signed (HS256) session cookie. State-changing requests whose `Origin` is not `WEB_ORIGIN` are rejected. In production set `WEB_ORIGIN` to your public https URL.

## Data notes (NYC Open Data / HPD)

- Violations (`wvxf-dwi5`) are mostly inspector-issued; complaints (`ygpa-z7cr`) are public reports, not findings. Never present a complaint as a violation.
- Join on `bin` (both datasets) or `block` + `lot`; the complaints dataset also has a `bbl` column.
- Records are per building, not per apartment.

## Known caveats

- Bedrock uses the Messages API endpoint (`@anthropic-ai/bedrock-sdk`, `AnthropicBedrockMantle`). Per Anthropic's docs it does not support structured outputs, URL file sources, or the Files API, so send documents as text and parse JSON from normal responses. Arize tracing of these calls was verified against a local stand-in server, not real Bedrock.
- `@surrealdb/memory` (the official SDK) is alpha, so `services/memory.ts` calls the documented REST API directly.
- `npm audit` reports a `braces` advisory pulled in by `@daytona/sdk`; no fix is published yet.
- Tenant data is sensitive: `data/cache/` and `data/uploads/` are git-ignored; use fake data for demos.
