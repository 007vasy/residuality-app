# Deploying StressForge publicly

A one-VM deployment with automatic HTTPS via Caddy. The example gallery is public
and read-only without login; Google / X sign-in unlocks creating and editing.

## Prerequisites

- A Linux VM with Docker + the Docker Compose plugin.
- A domain name with an **A record** pointing at the VM's public IP.
- Ports **80** and **443** open to the internet (Caddy needs 80 for the ACME challenge).

## 1. Configure

```bash
git clone https://github.com/007vasy/residuality-app.git stressforge && cd stressforge
cp .env.prod.example .env.prod
```

Edit `.env.prod`:

- `DOMAIN` — your domain (e.g. `stressforge.example.com`).
- `NEO4J_PASSWORD` / `NEO4J_AUTH` — a strong password (keep them consistent).
- `JWT_SECRET` and `APP_ENCRYPTION_KEY` — each `openssl rand -hex 32`.
- OAuth (optional) — see below.

## 2. (Optional) OAuth apps

**Google** — Google Cloud Console → *APIs & Services → Credentials* → *Create OAuth client ID* → *Web application*.
Add the authorized redirect URI:

```
https://<DOMAIN>/api/auth/oauth/google/callback
```

Put the client id/secret in `.env.prod`.

**X (Twitter)** — X Developer Portal → your app → *User authentication settings* → OAuth 2.0, **Confidential client**.
Set the callback URL and scopes:

```
Callback:  https://<DOMAIN>/api/auth/oauth/x/callback
Scopes:    tweet.read users.read
```

Put the client id/secret in `.env.prod`. Leave a provider's vars blank to disable it —
the sign-in modal only shows buttons for configured providers.

## 3. Launch

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

Caddy obtains a Let's Encrypt certificate for `DOMAIN` automatically and renews it.
On first boot the API migrates Neo4j and seeds the 14 public example projects
(set `SEED_EXAMPLES=false` to skip).

Visit `https://<DOMAIN>` — the public gallery loads with no login.

## 4. Operate

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f api
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
docker compose --env-file .env.prod -f docker-compose.prod.yml down      # stop
```

**Backups** — the Neo4j data lives in the `neo4j-data` volume. Back it up with:

```bash
docker run --rm -v stressforge_neo4j-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/neo4j-backup-$(date +%F).tgz -C /data .
```

## Notes

- Neo4j is **not** published to the internet in prod — it's only reachable inside the
  compose network. Manage it via `docker compose exec neo4j cypher-shell` if needed.
- BYOK LLM keys are encrypted at rest with `APP_ENCRYPTION_KEY`. Losing that key makes
  stored keys unrecoverable (users just re-enter them).
- To run behind an existing reverse proxy instead of Caddy, drop the `caddy` service
  and point your proxy at the `web` (SPA) and `api` (`/api`, `/mcp`, `/ws`) services.
