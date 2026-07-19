# Deploy to Cloud Run + Neo4j Aura

The leanest secure deployment: **one Cloud Run service** (the Fastify API also serves
the built SPA) backed by **Neo4j Aura**. Secrets live in Secret Manager and are
injected natively; the example gallery is seeded once by a Cloud Run **Job** (never
on service boot, so no multi-instance race). Runs in a **dedicated, minimal-privilege
GCP project**.

```
Cloud Run service (API + static SPA)  ──►  Neo4j Aura
        ▲                                     ▲
   public HTTPS (*.run.app or custom domain)  │
   Secret Manager (JWT, enc key, Neo4j pw, OAuth) — accessed by a scoped runtime SA
```

## 0. Dedicated GCP project (recommended)

Use a **dedicated** GCP project for StressForge (not a shared production project).
The operator account needs roughly: `roles/run.admin`, `roles/artifactregistry.admin`,
`roles/secretmanager.admin`, `roles/iam.serviceAccountAdmin`,
`roles/serviceusage.serviceUsageAdmin`, `roles/iam.serviceAccountUser` (Owner covers all).
Cloud Build’s default SA needs permission to push to Artifact Registry (normally granted
when you own the project).

## 1. Create the Neo4j Aura instance

At <https://console.neo4j.io>: create a database (Aura **Free** is enough for the
example gallery — hundreds of nodes). Copy its **connection URI** (`neo4j+s://…`),
username (`neo4j`), and the generated **password**.

## 2. Configure

```bash
cp deploy/cloud-run/config.env.example deploy/cloud-run/config.env
# edit config.env: PROJECT_ID, REGION, NEO4J_URI/USER/PASSWORD, (optional) DOMAIN + OAuth
```

`JWT_SECRET` and `APP_ENCRYPTION_KEY` are auto-generated **once** if left blank and
the secret does not yet exist in Secret Manager. Redeploys **reuse** existing
versions (they do not silently rotate). Set an explicit value in `config.env` only
when you intend to push a new version.
⚠️ Once generated, **keep `APP_ENCRYPTION_KEY`** — it encrypts users' BYOK LLM keys;
losing it means those must be re-entered. Do not commit `config.env` (gitignored).

## 3. Deploy

```bash
gcloud auth login          # an account with the roles listed in setup.sh
./deploy/cloud-run/setup.sh
```

The script (idempotent — safe to re-run to redeploy):
1. enables APIs + creates an Artifact Registry repo,
2. writes secrets to Secret Manager,
3. creates a **minimal-privilege runtime service account** (`secretAccessor` on the
   individual secrets only — no project-wide grants),
4. builds the image (Cloud Build, `Dockerfile.cloudrun`),
5. deploys the public Cloud Run service (secrets via `--set-secrets`),
6. runs a one-shot **seed Job** to publish the 14 example projects.

It prints the live URL and the exact OAuth redirect URIs to register.

## 4. Custom domain (optional)

```bash
gcloud run domain-mappings create --service stressforge --domain your.domain --region <REGION>
```

Add the CNAME/A record it prints, set `DOMAIN=your.domain` in `config.env`, and re-run
`setup.sh` so `PUBLIC_BASE_URL`/`CORS_ORIGIN`/OAuth callbacks use the custom domain.

## Cost & scaling (demo defaults)

| Knob | Default | Effect |
|---|---|---|
| `MIN_INSTANCES` | `0` | Scale-to-zero → ~$0 when idle |
| `MAX_INSTANCES` | `1` | Caps spend; required for in-memory WS + rate limits |
| `CPU` / `MEMORY` | `1` / `512Mi` | Smallest practical shape for gallery + light edit |
| `CONCURRENCY` | `40` | Limits parallel requests per instance |
| `TIMEOUT` | `300` | Enough for AI SSE; fails stuck requests |
| `CPU_ALWAYS_ALLOCATED` | `false` | CPU throttled when idle (cheaper) |
| Neo4j Aura | Free tier | Enough for the seeded gallery |
| LLM | BYOK | Host never pays Anthropic |

- First request after idle cold-starts (~1–3s).
- `MIN_INSTANCES=1` → no cold starts, roughly \$15–40/mo for the Cloud Run side alone.
- **Keep `MAX_INSTANCES=1`** unless you add shared pub/sub for WebSocket rooms **and** a
  shared rate-limit store (e.g. Redis). Public gallery reads do not need WebSockets.

## Abuse controls (public demo)

Wired into the API and set by `setup.sh` from `config.env`:

| Variable | Demo default | Purpose |
|---|---|---|
| `ALLOW_REGISTRATION` | `true` | Set `false` for gallery-only (no new email accounts) |
| `REGISTRATION_INVITE_CODE` | empty | If set, signup requires this code |
| `MAX_PROJECTS_PER_USER` | `5` | Stops unbounded graph growth per account |
| `RATE_LIMIT_MAX` | `300` | Global req/IP/minute |
| `AUTH_RATE_LIMIT_MAX` | `20` | Login / register / MCP |
| `AI_RATE_LIMIT_MAX` | `10` | BYOK AI SSE routes |

The SPA reads `/api/auth/providers` and hides or adapts the register form accordingly.

**Recommended public demo policies:**

1. Gallery always public (no login) — already the product default.
2. Prefer `REGISTRATION_INVITE_CODE` (share with friends) **or** `ALLOW_REGISTRATION=false`.
3. Keep `MAX_PROJECTS_PER_USER=5` (or lower).
4. Put Cloud Armor / Cloudflare in front later if you attract real traffic; app-level limits are a first line only.

## Notes

- **Least privilege:** the service runs as `stressforge-run@…` with `secretAccessor`
  on named secrets only. Use a separate deployer identity (or GitHub Actions +
  Workload Identity Federation) for CI to avoid downloaded keys.
- **Backups:** Aura manages backups on paid tiers; on Free, export via the console.
- **Migrations + seeding** run in the Job, not the service — so scaling the service
  never re-triggers them.
