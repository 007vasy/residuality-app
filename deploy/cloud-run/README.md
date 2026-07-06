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

## 1. Create the Neo4j Aura instance

At <https://console.neo4j.io>: create a database (Aura **Free** is enough for the
example gallery — hundreds of nodes). Copy its **connection URI** (`neo4j+s://…`),
username (`neo4j`), and the generated **password**.

## 2. Configure

```bash
cp deploy/cloud-run/config.env.example deploy/cloud-run/config.env
# edit config.env: PROJECT_ID, REGION, NEO4J_URI/USER/PASSWORD, (optional) DOMAIN + OAuth
```

`JWT_SECRET` and `APP_ENCRYPTION_KEY` are auto-generated if left blank.
⚠️ Once generated, **keep `APP_ENCRYPTION_KEY`** — it encrypts users' BYOK LLM keys;
losing it means those must be re-entered.

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

## Cost & scaling

- `MIN_INSTANCES=0` (default) → **scales to zero**, ~$0 when idle (Aura Free = $0).
  First request after idle cold-starts (~1–3s).
- `MIN_INSTANCES=1` → no cold starts, ~$15–40/mo.
- **Keep `MAX_INSTANCES=1`** unless you add shared pub/sub: WebSocket live-collaboration
  uses in-memory rooms, so cross-instance broadcast needs a single instance to be
  correct. Public read/matrix/risk views don't use WebSocket and scale fine — only the
  collaborative-edit broadcast is instance-local.

## Notes

- **Least privilege:** the service runs as `stressforge-run@…` with `secretAccessor`
  on named secrets only. Use a separate deployer identity (or GitHub Actions +
  Workload Identity Federation) for CI to avoid downloaded keys.
- **Backups:** Aura manages backups on paid tiers; on Free, export via the console.
- **Migrations + seeding** run in the Job, not the service — so scaling the service
  never re-triggers them.
